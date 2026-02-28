/**
 * Decay Engine
 *
 * Implements intelligent forgetting with token economics.
 * Memories progress through decay stages over time:
 * FULL (500 tokens) → COMPRESSED (250) → SUMMARY (150) → ESSENCE (50) → FORGOTTEN
 *
 * Exceptions:
 * - SHOCKS never decay
 * - High reinforcement/access counts slow decay
 * - Low success scores accelerate decay
 */

import { and, eq, inArray, lt, ne, sql } from 'drizzle-orm';

import { db } from '@/db';
import { memoryRingTable } from '@/db/schema';

import {
  ACCESS_SLOW_MULTIPLIER,
  ACCESS_SLOW_THRESHOLD,
  DECAY_SCHEDULE_DAYS,
  LOW_SUCCESS_MULTIPLIER,
  LOW_SUCCESS_THRESHOLD,
  MAX_MEMORIES_PER_RING,
  MIN_RELEVANCE_SCORE,
  NEXT_DECAY_STAGE,
  REINFORCEMENT_SLOW_MULTIPLIER,
  REINFORCEMENT_SLOW_THRESHOLD,
  TOKEN_BUDGETS,
  RECENCY_HALF_LIFE_DAYS,
  REINFORCEMENT_WEIGHT,
  SUCCESS_WEIGHT,
  ACCESS_WEIGHT,
  BASE_WEIGHT,
} from './constants';
import { createMemoryLLM } from './llm-factory';
import { generateEmbedding } from './embedding-service';
import { deleteMemoryRingVector, upsertMemoryRingVector } from './vector-service';
import type { DecayStage, MemoryResult } from './types';

// ============================================================================
// LLM Compression
// ============================================================================

function getCompressionLLM() {
  return createMemoryLLM('compression');
}

const COMPRESSION_PROMPTS: Record<string, string> = {
  compressed: `Compress the following memory to approximately 250 tokens. Keep the essential facts, actions, and outcomes. Remove redundancy and specific details that aren't critical.`,
  summary: `Summarize the following memory to approximately 150 tokens. Extract only the key insight, pattern, or lesson learned.`,
  essence: `Distill the following memory to its absolute essence in approximately 50 tokens. What is the one core takeaway?`,
};

/**
 * Compress content to the next decay stage
 */
async function compressContent(
  content: string,
  targetStage: DecayStage
): Promise<string> {
  const prompt = COMPRESSION_PROMPTS[targetStage];
  if (!prompt) {
    throw new Error(`No compression prompt for stage: ${targetStage}`);
  }

  const llm = getCompressionLLM();
  const response = await llm.invoke([
    { role: 'system', content: prompt },
    { role: 'user', content },
  ]);

  return typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content);
}

// ============================================================================
// Per-Memory Decay Helpers
// ============================================================================

type MemoryRow = typeof memoryRingTable.$inferSelect;

/**
 * Mark a memory as forgotten and remove its vector
 */
async function markMemoryForgotten(memory: MemoryRow): Promise<void> {
  await db
    .update(memoryRingTable)
    .set({
      current_decay_stage: 'forgotten',
      current_token_count: 0,
      updated_at: new Date(),
      metadata: appendDecayHistory(memory.metadata, memory.current_decay_stage, 'forgotten'),
    })
    .where(eq(memoryRingTable.uuid, memory.uuid));

  deleteMemoryRingVector(memory.uuid);
}

/**
 * Generate an embedding, returning null on failure (non-fatal)
 */
async function safeGenerateEmbedding(content: string): Promise<number[] | null> {
  try {
    return await generateEmbedding(content);
  } catch {
    return null;
  }
}

/**
 * Upsert a memory ring vector, ignoring errors (non-fatal)
 */
function safeUpsertVector(memory: MemoryRow, embedding: number[]): void {
  try {
    upsertMemoryRingVector(
      memory.uuid,
      embedding,
      memory.profile_uuid,
      memory.ring_type,
      memory.agent_uuid
    );
  } catch {
    // Non-fatal
  }
}

/**
 * Apply compression update to a memory: compress content, update DB, update vector
 */
async function applyCompressionUpdate(memory: MemoryRow, nextStage: DecayStage): Promise<void> {
  const currentContent = getCurrentContent(memory);
  if (!currentContent) {
    throw new Error('No content available for compression');
  }

  const compressedContent = await compressContent(currentContent, nextStage);
  const newEmbedding = await safeGenerateEmbedding(compressedContent);
  const nextDecayAt = calculateNextDecayDate(memory, nextStage);

  const updateData: Record<string, unknown> = {
    current_decay_stage: nextStage,
    current_token_count: Math.ceil(compressedContent.length / 4),
    next_decay_at: nextDecayAt,
    updated_at: new Date(),
    metadata: appendDecayHistory(memory.metadata, memory.current_decay_stage, nextStage),
  };

  if (nextStage === 'compressed') updateData.content_compressed = compressedContent;
  if (nextStage === 'summary') updateData.content_summary = compressedContent;
  if (nextStage === 'essence') updateData.content_essence = compressedContent;

  await db
    .update(memoryRingTable)
    .set(updateData)
    .where(eq(memoryRingTable.uuid, memory.uuid));

  if (newEmbedding) {
    safeUpsertVector(memory, newEmbedding);
  }
}

/**
 * Decay a single memory to its next stage. Returns 'forgotten' | 'compressed' | 'error'.
 */
async function decayOneMemory(memory: MemoryRow): Promise<'forgotten' | 'compressed' | 'error'> {
  const nextStage = NEXT_DECAY_STAGE[memory.current_decay_stage];

  if (nextStage === 'forgotten' || nextStage === null) {
    await markMemoryForgotten(memory);
    return 'forgotten';
  }

  try {
    await applyCompressionUpdate(memory, nextStage);
    return 'compressed';
  } catch {
    return 'error';
  }
}

// ============================================================================
// Decay Processing
// ============================================================================

/**
 * Process memories due for decay
 * @param profileUuid - When provided, only process memories belonging to this profile. When omitted (cron job), processes all.
 */
export async function processDecay(profileUuid?: string): Promise<MemoryResult<{
  processed: number;
  compressed: number;
  forgotten: number;
  errors: number;
}>> {
  try {
    let processed = 0;
    let compressed = 0;
    let forgotten = 0;
    let errors = 0;

    // Find memories due for decay (not shocks, not already forgotten)
    const conditions = [
      eq(memoryRingTable.is_shock, false),
      ne(memoryRingTable.current_decay_stage, 'forgotten'),
      lt(memoryRingTable.next_decay_at, new Date()),
    ];

    if (profileUuid) {
      conditions.push(eq(memoryRingTable.profile_uuid, profileUuid));
    }

    const dueForDecay = await db
      .select()
      .from(memoryRingTable)
      .where(and(...conditions))
      .limit(100); // Process in batches

    for (const memory of dueForDecay) {
      processed++;
      const result = await decayOneMemory(memory);
      if (result === 'forgotten') forgotten++;
      else if (result === 'compressed') compressed++;
      else errors++;
    }

    return {
      success: true,
      data: { processed, compressed, forgotten, errors },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process decay',
    };
  }
}

// ============================================================================
// Natural Selection
// ============================================================================

/**
 * Cull lowest-relevance memories when ring exceeds threshold
 */
export async function runNaturalSelection(
  profileUuid: string,
  options?: {
    maxPerRing?: number;
    minRelevanceScore?: number;
  }
): Promise<MemoryResult<{ culled: number }>> {
  try {
    const maxPerRing = options?.maxPerRing ?? MAX_MEMORIES_PER_RING;
    const minRelevance = options?.minRelevanceScore ?? MIN_RELEVANCE_SCORE;
    let totalCulled = 0;

    // First: update relevance scores
    await updateRelevanceScores(profileUuid);

    // Delete memories below minimum relevance
    const lowRelevance = await db
      .delete(memoryRingTable)
      .where(
        and(
          eq(memoryRingTable.profile_uuid, profileUuid),
          eq(memoryRingTable.is_shock, false),
          lt(memoryRingTable.relevance_score, minRelevance)
        )
      )
      .returning({ uuid: memoryRingTable.uuid });

    // Clean up zvec vectors for deleted memories
    for (const row of lowRelevance) {
      deleteMemoryRingVector(row.uuid);
    }

    totalCulled += lowRelevance.length;

    // For each ring type, ensure we're under the limit
    const ringTypes = ['procedures', 'practice', 'longterm', 'shocks'] as const;

    for (const ringType of ringTypes) {
      if (ringType === 'shocks') continue; // Never cull shocks

      const count = await db
        .select({ count: sql<number>`count(*)` })
        .from(memoryRingTable)
        .where(
          and(
            eq(memoryRingTable.profile_uuid, profileUuid),
            eq(memoryRingTable.ring_type, ringType)
          )
        );

      const currentCount = count[0]?.count ?? 0;
      if (currentCount <= maxPerRing) continue;

      // Delete excess memories with lowest relevance
      const excess = currentCount - maxPerRing;
      const toDelete = await db
        .select({ uuid: memoryRingTable.uuid })
        .from(memoryRingTable)
        .where(
          and(
            eq(memoryRingTable.profile_uuid, profileUuid),
            eq(memoryRingTable.ring_type, ringType),
            eq(memoryRingTable.is_shock, false)
          )
        )
        .orderBy(memoryRingTable.relevance_score)
        .limit(excess);

      if (toDelete.length > 0) {
        const uuids = toDelete.map(d => d.uuid);
        await db
          .delete(memoryRingTable)
          .where(inArray(memoryRingTable.uuid, uuids));
        // Clean up zvec vectors
        for (const u of uuids) {
          deleteMemoryRingVector(u);
        }
        totalCulled += toDelete.length;
      }
    }

    return { success: true, data: { culled: totalCulled } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to run natural selection',
    };
  }
}

// ============================================================================
// Relevance Score Calculation
// ============================================================================

/**
 * Update relevance scores for all memories in a profile
 */
async function updateRelevanceScores(profileUuid: string): Promise<void> {
  // Relevance = base * recency * reinforcement * success * access
  // Using SQL for efficiency
  await db.execute(sql`
    UPDATE memory_ring
    SET relevance_score = GREATEST(0.01,
      ${BASE_WEIGHT}
      * EXP(-0.693 * EXTRACT(EPOCH FROM (NOW() - COALESCE(last_accessed_at, created_at))) / (${RECENCY_HALF_LIFE_DAYS} * 86400))
      * (1.0 + ${REINFORCEMENT_WEIGHT} * LEAST(reinforcement_count, 20))
      * (1.0 + ${SUCCESS_WEIGHT} * COALESCE(success_score, 0.5))
      * (1.0 + ${ACCESS_WEIGHT} * LN(1 + COALESCE(access_count, 0)))
    )
    WHERE profile_uuid = ${profileUuid}
      AND is_shock = false
      AND current_decay_stage != 'forgotten'
  `);
}

/**
 * Reinforce a memory (called when memory is accessed or re-observed)
 */
export async function reinforceMemory(memoryUuid: string): Promise<void> {
  await db
    .update(memoryRingTable)
    .set({
      reinforcement_count: sql`${memoryRingTable.reinforcement_count} + 1`,
      last_accessed_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(memoryRingTable.uuid, memoryUuid));
}

/**
 * Clean up forgotten memories
 * @param profileUuid - When provided, only clean up memories belonging to this profile. When omitted (cron job), cleans all.
 */
export async function cleanupForgotten(profileUuid?: string): Promise<number> {
  const conditions = [eq(memoryRingTable.current_decay_stage, 'forgotten')];
  if (profileUuid) {
    conditions.push(eq(memoryRingTable.profile_uuid, profileUuid));
  }

  const result = await db
    .delete(memoryRingTable)
    .where(and(...conditions))
    .returning({ uuid: memoryRingTable.uuid });

  // Clean up zvec vectors
  for (const row of result) {
    deleteMemoryRingVector(row.uuid);
  }

  return result.length;
}

// ============================================================================
// Helpers
// ============================================================================

function appendDecayHistory(
  metadata: unknown,
  fromStage: string,
  toStage: string
): Record<string, unknown> {
  const existing = (metadata as Record<string, unknown>) ?? {};
  const history = (existing.decay_history ?? []) as Array<{ from: string; to: string; at: string }>;
  return {
    ...existing,
    decay_history: [
      ...history,
      { from: fromStage, to: toStage, at: new Date().toISOString() },
    ],
  };
}

function getCurrentContent(memory: typeof memoryRingTable.$inferSelect): string | null {
  switch (memory.current_decay_stage) {
    case 'full': return memory.content_full;
    case 'compressed': return memory.content_compressed;
    case 'summary': return memory.content_summary;
    case 'essence': return memory.content_essence;
    default: return null;
  }
}

function calculateNextDecayDate(
  memory: typeof memoryRingTable.$inferSelect,
  nextStage: DecayStage
): Date {
  const baseDays = DECAY_SCHEDULE_DAYS[nextStage] ?? 30;
  let multiplier = 1.0;

  // High reinforcement slows decay
  if ((memory.reinforcement_count ?? 0) > REINFORCEMENT_SLOW_THRESHOLD) {
    multiplier *= REINFORCEMENT_SLOW_MULTIPLIER;
  }

  // High access slows decay
  if ((memory.access_count ?? 0) > ACCESS_SLOW_THRESHOLD) {
    multiplier *= ACCESS_SLOW_MULTIPLIER;
  }

  // Low success accelerates decay
  if (memory.success_score !== null && memory.success_score < LOW_SUCCESS_THRESHOLD) {
    multiplier *= LOW_SUCCESS_MULTIPLIER;
  }

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + Math.round(baseDays * multiplier));
  return nextDate;
}
