/**
 * Dream Processor — Memory Consolidation
 *
 * Discovers clusters of related memories via zvec embeddings,
 * then consolidates them into single unified memories using LLM.
 *
 * Integrated into the decay engine cron — not a separate job.
 * Source memories are NOT deleted; they decay naturally.
 */

import { createHash } from 'crypto';

import { and, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  dreamConsolidationsTable,
  memoryRingTable,
} from '@/db/schema';
import { createMemoryLLM } from '../llm-factory';
import { extractResponseText } from '../llm-utils';
import { generateEmbedding } from '../embedding-service';
import { searchMemoryRing, upsertMemoryRingVector } from '../vector-service';

import {
  DREAM_CONSOLIDATION_MAX_INPUT_TOKENS,
  DREAM_CONSOLIDATION_MAX_OUTPUT_TOKENS,
  DREAM_CONSOLIDATION_PROMPT,
  DREAM_COOLDOWN_DAYS,
  DREAM_ENABLED,
  DREAM_MAX_CLUSTERS_PER_RUN,
  DREAM_MIN_CLUSTER_SIZE,
  DREAM_PROCESSING_ADVISORY_LOCK_KEY,
  DREAM_SIMILARITY_THRESHOLD,
  DREAM_TOP_K_NEIGHBORS,
} from './constants';
import type { MemoryResult, RingType } from '../types';
import type { DreamCluster, DreamProcessingResult } from './types';

type MemoryRow = typeof memoryRingTable.$inferSelect;

// ============================================================================
// Advisory Lock Helpers
// ============================================================================

/**
 * Derive a per-profile numeric lock key from the profile UUID.
 * Uses SHA-256 for uniform distribution across the 32-bit integer space.
 */
function profileLockKey(profileUuid: string): number {
  const hash = createHash('sha256').update(profileUuid).digest().readUInt32BE(0);
  return (DREAM_PROCESSING_ADVISORY_LOCK_KEY * 1000) + (hash % 2147483647);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Run dream processing for a profile.
 * Called from processDecay() — no separate cron needed.
 */
export async function processDreams(
  profileUuid: string
): Promise<MemoryResult<DreamProcessingResult>> {
  if (!DREAM_ENABLED) {
    return { success: true, data: { clustersFound: 0, consolidated: 0, totalTokenSavings: 0, errors: 0 } };
  }

  const lockKey = profileLockKey(profileUuid);

  try {
    // Advisory lock to prevent concurrent runs for the same profile
    const lockQueryResult = await db.execute(
      sql`SELECT pg_try_advisory_lock(${lockKey}) as acquired`
    );
    const lockResult = lockQueryResult.rows[0] as { acquired: boolean } | undefined;
    if (!lockResult?.acquired) {
      return { success: false, error: 'Dream processing already running for this profile' };
    }

    try {
      // Phase 1: Cluster Discovery
      const clusters = await discoverClusters(profileUuid);

      if (clusters.length === 0) {
        return { success: true, data: { clustersFound: 0, consolidated: 0, totalTokenSavings: 0, errors: 0 } };
      }

      // Phase 2 & 3: Consolidation
      let consolidated = 0;
      let totalTokenSavings = 0;
      let errors = 0;

      const clustersToProcess = clusters.slice(0, DREAM_MAX_CLUSTERS_PER_RUN);

      for (const cluster of clustersToProcess) {
        try {
          const result = await consolidateCluster(cluster);
          if (result) {
            consolidated++;
            totalTokenSavings += result.tokenSavings;
          }
        } catch (err) {
          console.warn('[dream-processor] consolidation failed for cluster:', err);
          errors++;
        }
      }

      return {
        success: true,
        data: {
          clustersFound: clusters.length,
          consolidated,
          totalTokenSavings,
          errors,
        },
      };
    } finally {
      await db.execute(
        sql`SELECT pg_advisory_unlock(${lockKey})`
      );
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Dream processing failed',
    };
  }
}

// ============================================================================
// Phase 1: Cluster Discovery (No LLM)
// ============================================================================

async function discoverClusters(profileUuid: string): Promise<DreamCluster[]> {
  // Get active memories not already clustered (or past cooldown period)
  const cooldownCutoff = new Date(Date.now() - DREAM_COOLDOWN_DAYS * 86_400_000);
  const memories = await db
    .select()
    .from(memoryRingTable)
    .where(
      and(
        eq(memoryRingTable.profile_uuid, profileUuid),
        ne(memoryRingTable.current_decay_stage, 'forgotten'),
        ne(memoryRingTable.current_decay_stage, 'essence'),
        or(
          isNull(memoryRingTable.dream_cluster_id),
          lt(memoryRingTable.dream_processed_at, cooldownCutoff)
        )
      )
    )
    .limit(200); // Cap to prevent excessive vector queries

  if (memories.length < DREAM_MIN_CLUSTER_SIZE) {
    return [];
  }

  // Build adjacency via zvec nearest-neighbor queries
  // We generate an embedding from each memory's content and search for neighbors
  const adjacency = new Map<string, Set<string>>();
  const memoryUuids = new Set(memories.map((m) => m.uuid));

  // Pre-filter memories that have content
  const memoriesWithContent = memories
    .map((m) => ({ memory: m, content: getCurrentContent(m) }))
    .filter((entry): entry is { memory: MemoryRow; content: string } => entry.content != null);

  // Generate embeddings in parallel chunks to avoid N+1 sequential calls
  const CHUNK_SIZE = 10;
  for (let i = 0; i < memoriesWithContent.length; i += CHUNK_SIZE) {
    const chunk = memoriesWithContent.slice(i, i + CHUNK_SIZE);
    const embeddings = await Promise.all(
      chunk.map(async ({ content }) => {
        try {
          return await generateEmbedding(content);
        } catch {
          return null; // Skip this memory if embedding fails
        }
      })
    );

    for (let j = 0; j < chunk.length; j++) {
      const queryEmbedding = embeddings[j];
      if (!queryEmbedding) continue;

      const { memory } = chunk[j];

      const neighbors = await searchMemoryRing({
        queryEmbedding,
        profileUuid,
        topK: DREAM_TOP_K_NEIGHBORS + 1, // +1 to exclude self
        threshold: DREAM_SIMILARITY_THRESHOLD,
      });

      // Filter to only memories in our candidate set
      const validNeighbors = neighbors
        .filter((n) => n.uuid !== memory.uuid && memoryUuids.has(n.uuid))
        .slice(0, DREAM_TOP_K_NEIGHBORS);

      if (validNeighbors.length > 0) {
        if (!adjacency.has(memory.uuid)) {
          adjacency.set(memory.uuid, new Set());
        }
        for (const neighbor of validNeighbors) {
          adjacency.get(memory.uuid)!.add(neighbor.uuid);
          // Bidirectional
          if (!adjacency.has(neighbor.uuid)) {
            adjacency.set(neighbor.uuid, new Set());
          }
          adjacency.get(neighbor.uuid)!.add(memory.uuid);
        }
      }
    }
  }

  // Union-Find to discover connected components
  const parent = new Map<string, string>();
  const rank = new Map<string, number>();

  function find(x: string): string {
    if (!parent.has(x)) {
      parent.set(x, x);
      rank.set(x, 0);
    }
    if (parent.get(x) !== x) {
      parent.set(x, find(parent.get(x)!));
    }
    return parent.get(x)!;
  }

  function union(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    const rankA = rank.get(ra) ?? 0;
    const rankB = rank.get(rb) ?? 0;
    if (rankA < rankB) parent.set(ra, rb);
    else if (rankA > rankB) parent.set(rb, ra);
    else {
      parent.set(rb, ra);
      rank.set(ra, rankA + 1);
    }
  }

  // Build unions from adjacency
  for (const [uuid, neighbors] of adjacency) {
    for (const neighbor of neighbors) {
      union(uuid, neighbor);
    }
  }

  // Group by component
  const components = new Map<string, string[]>();
  for (const uuid of adjacency.keys()) {
    const root = find(uuid);
    if (!components.has(root)) {
      components.set(root, []);
    }
    components.get(root)!.push(uuid);
  }

  // Filter: only clusters with >= DREAM_MIN_CLUSTER_SIZE members
  const memoryMap = new Map(memories.map((m) => [m.uuid, m]));
  const clusters: DreamCluster[] = [];

  for (const [, memberUuids] of components) {
    if (memberUuids.length < DREAM_MIN_CLUSTER_SIZE) continue;

    const members = memberUuids
      .map((uuid) => memoryMap.get(uuid))
      .filter((m): m is MemoryRow => m != null);

    // Determine dominant ring type
    const ringCounts = new Map<string, number>();
    let totalTokens = 0;
    for (const m of members) {
      ringCounts.set(m.ring_type, (ringCounts.get(m.ring_type) ?? 0) + 1);
      totalTokens += m.current_token_count ?? 0;
    }
    const dominantRingType = [...ringCounts.entries()].sort(
      (a, b) => b[1] - a[1]
    )[0][0] as RingType;

    clusters.push({
      id: crypto.randomUUID(),
      profileUuid,
      memberUuids,
      centroidEmbedding: [], // Calculated during consolidation if needed
      avgSimilarity: DREAM_SIMILARITY_THRESHOLD,
      dominantRingType,
      totalTokens,
    });
  }

  // Sort by cluster size (largest first)
  clusters.sort((a, b) => b.memberUuids.length - a.memberUuids.length);

  return clusters;
}

// ============================================================================
// Phase 2 & 3: Consolidation (LLM)
// ============================================================================

async function consolidateCluster(
  cluster: DreamCluster
): Promise<{ tokenSavings: number } | null> {
  // Fetch full content for cluster members
  const members = await db
    .select()
    .from(memoryRingTable)
    .where(inArray(memoryRingTable.uuid, cluster.memberUuids));

  if (members.length < DREAM_MIN_CLUSTER_SIZE) return null;

  // Build input content (respect token budget)
  const contents: string[] = [];
  let totalInputTokens = 0;
  for (const m of members) {
    const content = getCurrentContent(m);
    if (!content) continue;
    const tokenEstimate = Math.ceil(content.length / 4);
    if (totalInputTokens + tokenEstimate > DREAM_CONSOLIDATION_MAX_INPUT_TOKENS) break;
    contents.push(content);
    totalInputTokens += tokenEstimate;
  }

  if (contents.length < DREAM_MIN_CLUSTER_SIZE) return null;

  // LLM consolidation
  const llm = createMemoryLLM('compression', { maxTokens: DREAM_CONSOLIDATION_MAX_OUTPUT_TOKENS });
  const userContent = contents
    .map((c, i) => `--- MEMORY ${i + 1} ---\n${c}`)
    .join('\n\n');

  const response = await llm.invoke([
    { role: 'system', content: DREAM_CONSOLIDATION_PROMPT },
    { role: 'user', content: userContent },
  ]);

  const consolidatedText = extractResponseText(response);
  if (!consolidatedText || consolidatedText.length < 20) return null;

  const consolidatedTokens = Math.ceil(consolidatedText.length / 4);
  const tokenSavings = Math.max(0, totalInputTokens - consolidatedTokens);

  // Calculate aggregate scores
  const avgSuccess =
    members.reduce((sum, m) => sum + (m.success_score ?? 0.5), 0) /
    members.length;
  const totalReinforcement = members.reduce(
    (sum, m) => sum + (m.reinforcement_count ?? 0),
    0
  );
  const maxRelevance = Math.max(
    ...members.map((m) => m.relevance_score ?? 0)
  );

  // Generate embedding for consolidated content
  let embedding: number[] | null = null;
  try {
    embedding = await generateEmbedding(consolidatedText);
  } catch {
    console.warn('Failed to generate embedding for dream consolidation');
  }

  // Create consolidated memory + record dream + mark sources — all in one transaction
  const clusterId = cluster.id;

  await db.transaction(async (tx) => {
    // 1. Create new consolidated memory
    const [newMemory] = await tx
      .insert(memoryRingTable)
      .values({
        profile_uuid: cluster.profileUuid,
        ring_type: cluster.dominantRingType,
        content_full: consolidatedText,
        current_decay_stage: 'full',
        current_token_count: consolidatedTokens,
        success_score: avgSuccess,
        reinforcement_count: totalReinforcement,
        relevance_score: maxRelevance,
        source_observation_uuids: cluster.memberUuids,
        is_shock: false,
        tags: ['dream_consolidated'],
        metadata: {
          source: 'dream',
          cluster_id: clusterId,
          source_count: members.length,
          token_savings: tokenSavings,
          consolidated_at: new Date().toISOString(),
        },
      })
      .returning({ uuid: memoryRingTable.uuid });

    // 2. Record dream consolidation
    await tx.insert(dreamConsolidationsTable).values({
      profile_uuid: cluster.profileUuid,
      result_memory_uuid: newMemory?.uuid,
      source_memory_uuids: cluster.memberUuids,
      cluster_similarity: cluster.avgSimilarity,
      token_savings: tokenSavings,
      source_count: members.length,
    });

    // 3. Mark source memories with cluster ID and processing timestamp
    await tx
      .update(memoryRingTable)
      .set({ dream_cluster_id: clusterId, dream_processed_at: new Date() })
      .where(inArray(memoryRingTable.uuid, cluster.memberUuids));

    // 4. Upsert vector for new consolidated memory
    if (embedding && newMemory) {
      try {
        await upsertMemoryRingVector(
          newMemory.uuid,
          embedding,
          cluster.profileUuid,
          cluster.dominantRingType
        );
      } catch (err) {
        console.warn('Failed to upsert vector for dream consolidated memory:', err);
      }
    }
  });

  return { tokenSavings };
}

// ============================================================================
// Helpers
// ============================================================================

function getCurrentContent(memory: MemoryRow): string | null {
  switch (memory.current_decay_stage) {
    case 'full':
      return memory.content_full;
    case 'compressed':
      return memory.content_compressed;
    case 'summary':
      return memory.content_summary;
    case 'essence':
      return memory.content_essence;
    default:
      return null;
  }
}
