/**
 * Retrieval Service
 *
 * Progressive 3-layer disclosure for 10x token efficiency:
 * Layer 1 - Search: Returns essence/summary only (50-150 tokens each)
 * Layer 2 - Timeline: Adds temporal context (when, which session)
 * Layer 3 - Full Details: Returns complete content for selected memories
 */

import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { gutPatternsTable, memoryRingTable, memorySessionsTable } from '@/db/schema';

import { generateEmbedding } from './embedding-service';
import { searchMemoryRing, searchGutPatterns, recordMemoryAccess } from './vector-service';
import type {
  MemoryFullDetail,
  MemoryResult,
  MemorySearchResult,
  MemoryTimelineEntry,
  RingType,
  SearchMemoriesParams,
} from './types';

// ============================================================================
// Layer 1: Search (50-150 tokens per result)
// ============================================================================

/**
 * Semantic search across memory ring - returns lightweight results
 */
export async function searchMemories(
  params: SearchMemoriesParams
): Promise<MemoryResult<MemorySearchResult[]>> {
  try {
    const queryEmbedding = await generateEmbedding(params.query);

    // Search zvec for similar memories (returns uuid + score)
    const vectorResults = searchMemoryRing({
      profileUuid: params.profileUuid,
      queryEmbedding,
      ringTypes: params.ringTypes,
      topK: params.topK ?? 10,
      threshold: params.threshold ?? 0.5,
      agentUuid: params.agentUuid,
    });

    const results: MemorySearchResult[] = [];

    if (vectorResults.length > 0) {
      // Fetch full data from PostgreSQL for matched UUIDs
      const uuids = vectorResults.map(r => r.uuid);
      const scoreMap = new Map(vectorResults.map(r => [r.uuid, r.score]));

      const memories = await db
        .select({
          uuid: memoryRingTable.uuid,
          ringType: memoryRingTable.ring_type,
          contentEssence: memoryRingTable.content_essence,
          contentSummary: memoryRingTable.content_summary,
          currentDecayStage: memoryRingTable.current_decay_stage,
          currentTokenCount: memoryRingTable.current_token_count,
          tags: memoryRingTable.tags,
          createdAt: memoryRingTable.created_at,
          lastAccessedAt: memoryRingTable.last_accessed_at,
        })
        .from(memoryRingTable)
        .where(inArray(memoryRingTable.uuid, uuids));

      for (const m of memories) {
        results.push({
          uuid: m.uuid,
          ringType: m.ringType as RingType,
          content: m.contentEssence || m.contentSummary || '',
          similarity: scoreMap.get(m.uuid) ?? 0,
          decayStage: m.currentDecayStage as MemorySearchResult['decayStage'],
          tokenCount: m.currentTokenCount,
          tags: (m.tags ?? []) as string[],
          createdAt: m.createdAt?.toISOString() ?? '',
          lastAccessedAt: m.lastAccessedAt?.toISOString(),
        });
      }

      // Sort by similarity (zvec order may not match DB order)
      results.sort((a, b) => b.similarity - a.similarity);
    }

    // Optionally include gut patterns
    if (params.includeGut) {
      const gutVectorResults = searchGutPatterns({
        queryEmbedding,
        topK: 3,
        threshold: params.threshold ?? 0.5,
      });

      if (gutVectorResults.length > 0) {
        const gutUuids = gutVectorResults.map(r => r.uuid);
        const gutScoreMap = new Map(gutVectorResults.map(r => [r.uuid, r.score]));

        const gutPatterns = await db
          .select()
          .from(gutPatternsTable)
          .where(inArray(gutPatternsTable.uuid, gutUuids));

        for (const g of gutPatterns) {
          results.push({
            uuid: g.uuid,
            ringType: 'longterm' as RingType,
            content: `[Collective] ${g.compressed_pattern}`,
            similarity: gutScoreMap.get(g.uuid) ?? 0,
            decayStage: 'essence',
            tokenCount: Math.ceil((g.compressed_pattern?.length ?? 0) / 4),
            tags: ['gut-pattern'],
            createdAt: '',
          });
        }
      }
    }

    return { success: true, data: results };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search memories',
    };
  }
}

// ============================================================================
// Layer 2: Timeline (adds temporal context)
// ============================================================================

/**
 * Get timeline view for selected memories
 * @param profileUuid - Required for authorization: only returns memories belonging to this profile
 */
export async function getMemoryTimeline(
  memoryUuids: string[],
  profileUuid: string
): Promise<MemoryResult<MemoryTimelineEntry[]>> {
  try {
    if (memoryUuids.length === 0) {
      return { success: true, data: [] };
    }

    const memories = await db
      .select({
        uuid: memoryRingTable.uuid,
        ringType: memoryRingTable.ring_type,
        contentCompressed: memoryRingTable.content_compressed,
        contentSummary: memoryRingTable.content_summary,
        contentEssence: memoryRingTable.content_essence,
        currentDecayStage: memoryRingTable.current_decay_stage,
        accessCount: memoryRingTable.access_count,
        relevanceScore: memoryRingTable.relevance_score,
        sourceSessionUuid: memoryRingTable.source_session_uuid,
        sourceObservationUuids: memoryRingTable.source_observation_uuids,
        createdAt: memoryRingTable.created_at,
        // Join session for temporal context
        sessionStartedAt: memorySessionsTable.started_at,
      })
      .from(memoryRingTable)
      .leftJoin(
        memorySessionsTable,
        eq(memoryRingTable.source_session_uuid, memorySessionsTable.uuid)
      )
      .where(
        and(
          inArray(memoryRingTable.uuid, memoryUuids),
          eq(memoryRingTable.profile_uuid, profileUuid)
        )
      )
      .orderBy(desc(memoryRingTable.created_at));

    const results: MemoryTimelineEntry[] = memories.map(m => ({
      uuid: m.uuid,
      ringType: m.ringType as RingType,
      // Layer 2: provide compressed or summary content
      content: m.contentSummary || m.contentCompressed || m.contentEssence || '',
      contentCompressed: m.contentCompressed ?? undefined,
      similarity: 0, // Not applicable in timeline view
      sessionUuid: m.sourceSessionUuid ?? undefined,
      sessionStartedAt: m.sessionStartedAt?.toISOString(),
      sourceObservationCount: m.sourceObservationUuids?.length ?? 0,
      createdAt: m.createdAt?.toISOString() ?? '',
      decayStage: m.currentDecayStage as MemoryTimelineEntry['decayStage'],
      accessCount: m.accessCount ?? 0,
      relevanceScore: m.relevanceScore ?? 0,
    }));

    return { success: true, data: results };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get memory timeline',
    };
  }
}

// ============================================================================
// Layer 3: Full Details
// ============================================================================

/**
 * Get full details for selected memories (highest token cost)
 * @param profileUuid - Required for authorization: only returns memories belonging to this profile
 */
export async function getMemoryDetails(
  memoryUuids: string[],
  profileUuid: string
): Promise<MemoryResult<MemoryFullDetail[]>> {
  try {
    if (memoryUuids.length === 0) {
      return { success: true, data: [] };
    }

    const memories = await db
      .select()
      .from(memoryRingTable)
      .where(
        and(
          inArray(memoryRingTable.uuid, memoryUuids),
          eq(memoryRingTable.profile_uuid, profileUuid)
        )
      );

    // Record access for each retrieved memory
    await Promise.all(
      memories.map(m => recordMemoryAccess(m.uuid))
    );

    const results: MemoryFullDetail[] = memories.map(m => ({
      uuid: m.uuid,
      profileUuid: m.profile_uuid,
      agentUuid: m.agent_uuid ?? undefined,
      ringType: m.ring_type as RingType,
      contentFull: m.content_full ?? undefined,
      contentCompressed: m.content_compressed ?? undefined,
      contentSummary: m.content_summary ?? undefined,
      contentEssence: m.content_essence ?? undefined,
      currentDecayStage: m.current_decay_stage as MemoryFullDetail['currentDecayStage'],
      currentTokenCount: m.current_token_count,
      accessCount: m.access_count ?? 0,
      lastAccessedAt: m.last_accessed_at?.toISOString(),
      relevanceScore: m.relevance_score ?? 0,
      successScore: m.success_score ?? undefined,
      reinforcementCount: m.reinforcement_count ?? 0,
      isShock: m.is_shock ?? false,
      shockSeverity: m.shock_severity ?? undefined,
      tags: (m.tags ?? []) as string[],
      metadata: (m.metadata ?? {}) as Record<string, unknown>,
      sourceSessionUuid: m.source_session_uuid ?? undefined,
      sourceObservationUuids: m.source_observation_uuids ?? undefined,
      nextDecayAt: m.next_decay_at?.toISOString(),
      createdAt: m.created_at?.toISOString() ?? '',
      updatedAt: m.updated_at?.toISOString() ?? '',
    }));

    return { success: true, data: results };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get memory details',
    };
  }
}
