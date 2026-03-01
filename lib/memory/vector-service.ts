/**
 * Memory Vector Service
 *
 * Thin wrapper over the shared vector infrastructure (@/lib/vectors/).
 * Provides ergonomic, memory-domain-specific functions that delegate
 * to the hardened shared layer (HMR persistence, path validation,
 * corruption detection, lock error handling, injection-safe filters).
 */

import { eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { memoryRingTable } from '@/db/schema';
import {
  buildFilter,
  deleteVectors,
  searchVectors,
  upsertVector,
} from '@/lib/vectors/vector-service';

import { DEFAULT_TOP_K, SIMILARITY_THRESHOLD } from './constants';
import type { RingType } from './types';

/**
 * Guard: profileUuid must be a non-empty string.
 * buildFilter silently drops empty values, which would remove tenant isolation.
 */
function requireProfileUuid(profileUuid: string): void {
  if (!profileUuid) {
    throw new Error('profileUuid is required for memory vector operations');
  }
}

// ============================================================================
// Upsert Operations
// ============================================================================

/**
 * Store or update a fresh memory embedding
 */
export function upsertFreshMemoryVector(
  uuid: string,
  embedding: number[],
  profileUuid: string,
  agentUuid?: string | null
): void {
  requireProfileUuid(profileUuid);
  upsertVector({
    id: uuid,
    embedding,
    domain: 'fresh_memory',
    fields: {
      profile_uuid: profileUuid,
      agent_uuid: agentUuid ?? '',
    },
  });
}

/**
 * Store or update a memory ring embedding
 */
export function upsertMemoryRingVector(
  uuid: string,
  embedding: number[],
  profileUuid: string,
  ringType: string,
  agentUuid?: string | null
): void {
  requireProfileUuid(profileUuid);
  upsertVector({
    id: uuid,
    embedding,
    domain: 'memory_ring',
    fields: {
      profile_uuid: profileUuid,
      agent_uuid: agentUuid ?? '',
      ring_type: ringType,
    },
  });
}

/**
 * Store or update a gut pattern embedding
 */
export function upsertGutPatternVector(
  uuid: string,
  embedding: number[],
  patternType: string
): void {
  upsertVector({
    id: uuid,
    embedding,
    domain: 'gut_patterns',
    fields: { pattern_type: patternType },
  });
}

// ============================================================================
// Delete Operations
// ============================================================================

/**
 * Delete a vector from fresh memory collection
 */
export function deleteFreshMemoryVector(uuid: string): void {
  try {
    deleteVectors({ ids: [uuid], domain: 'fresh_memory' });
  } catch (error) {
    console.warn(`Failed to delete fresh memory vector ${uuid}:`, error);
  }
}

/**
 * Delete a vector from memory ring collection
 */
export function deleteMemoryRingVector(uuid: string): void {
  try {
    deleteVectors({ ids: [uuid], domain: 'memory_ring' });
  } catch (error) {
    console.warn(`Failed to delete memory ring vector ${uuid}:`, error);
  }
}

/**
 * Delete a vector from gut patterns collection
 */
export function deleteGutPatternVector(uuid: string): void {
  try {
    deleteVectors({ ids: [uuid], domain: 'gut_patterns' });
  } catch (error) {
    console.warn(`Failed to delete gut pattern vector ${uuid}:`, error);
  }
}

// ============================================================================
// Search Operations
// ============================================================================

/**
 * Search fresh memory by semantic similarity
 */
export function searchFreshMemory(params: {
  profileUuid: string;
  queryEmbedding: number[];
  topK?: number;
  threshold?: number;
  agentUuid?: string;
}): Array<{ uuid: string; score: number }> {
  requireProfileUuid(params.profileUuid);

  const filter = buildFilter([
    ['profile_uuid', params.profileUuid],
    params.agentUuid ? ['agent_uuid', params.agentUuid] : null,
  ]);

  const results = searchVectors({
    embedding: params.queryEmbedding,
    domain: 'fresh_memory',
    topK: params.topK ?? DEFAULT_TOP_K,
    filter,
    threshold: params.threshold ?? SIMILARITY_THRESHOLD,
  });

  return results.map(r => ({ uuid: r.id, score: r.score }));
}

/**
 * Search memory ring by semantic similarity
 */
export function searchMemoryRing(params: {
  profileUuid: string;
  queryEmbedding: number[];
  ringTypes?: RingType[];
  topK?: number;
  threshold?: number;
  agentUuid?: string;
}): Array<{ uuid: string; score: number }> {
  const {
    profileUuid,
    queryEmbedding,
    ringTypes,
    topK: topKParam,
    threshold,
    agentUuid,
  } = params;
  requireProfileUuid(profileUuid);
  const topK = topKParam ?? DEFAULT_TOP_K;

  // For single ring type, use filter. For multiple, over-fetch and filter in JS.
  const filter = buildFilter([
    ['profile_uuid', profileUuid],
    agentUuid ? ['agent_uuid', agentUuid] : null,
    ringTypes && ringTypes.length === 1 ? ['ring_type', ringTypes[0]] : null,
  ]);

  const results = searchVectors({
    embedding: queryEmbedding,
    domain: 'memory_ring',
    topK: ringTypes && ringTypes.length > 1 ? topK * 3 : topK,
    filter,
    threshold: threshold ?? SIMILARITY_THRESHOLD,
  });

  let filtered = results;

  // Apply ring type filter if multiple types specified
  if (ringTypes && ringTypes.length > 1) {
    const typeSet = new Set(ringTypes);
    filtered = results.filter(r => typeSet.has(r.fields.ring_type as RingType));
  }

  return filtered
    .slice(0, topK)
    .map(r => ({ uuid: r.id, score: r.score }));
}

/**
 * Search collective wisdom patterns by semantic similarity
 */
export function searchGutPatterns(params: {
  queryEmbedding: number[];
  topK?: number;
  threshold?: number;
}): Array<{ uuid: string; score: number }> {
  const results = searchVectors({
    embedding: params.queryEmbedding,
    domain: 'gut_patterns',
    topK: params.topK ?? 5,
    threshold: params.threshold ?? SIMILARITY_THRESHOLD,
  });

  return results.map(r => ({ uuid: r.id, score: r.score }));
}

// ============================================================================
// Increment Access Count (reinforcement on retrieval)
// ============================================================================

/**
 * Update access stats when a memory is retrieved
 */
export async function recordMemoryAccess(memoryUuid: string): Promise<void> {
  await db
    .update(memoryRingTable)
    .set({
      access_count: sql`${memoryRingTable.access_count} + 1`,
      last_accessed_at: new Date(),
    })
    .where(eq(memoryRingTable.uuid, memoryUuid));
}
