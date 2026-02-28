/**
 * Vector Service
 *
 * In-process vector search using zvec (Alibaba's lightweight vector database).
 * Vectors are stored on disk in zvec collections, separate from PostgreSQL.
 * Each collection stores document IDs + embeddings + key filter fields.
 *
 * Collections:
 * - fresh_memory: observation embeddings (filter by profile_uuid, agent_uuid)
 * - memory_ring: long-term memory embeddings (filter by profile_uuid, agent_uuid, ring_type)
 * - gut_patterns: collective wisdom embeddings (filter by pattern_type)
 */

import path from 'path';
import {
  ZVecCollectionSchema,
  ZVecCreateAndOpen,
  ZVecDataType,
  ZVecIndexType,
  ZVecInitialize,
  ZVecMetricType,
  ZVecOpen,
  type ZVecCollection,
  type ZVecDoc,
} from '@zvec/zvec';
import { eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { memoryRingTable } from '@/db/schema';

import { DEFAULT_TOP_K, EMBEDDING_DIMENSIONS, SIMILARITY_THRESHOLD } from './constants';
import type { RingType } from './types';

// ============================================================================
// Configuration
// ============================================================================

const ZVEC_DATA_DIR = process.env.MEMORY_VECTOR_DATA_DIR
  || path.join(process.cwd(), 'data', 'memory-vectors');

let initialized = false;

function ensureInitialized(): void {
  if (!initialized) {
    ZVecInitialize({
      logLevel: 2, // WARN
    });
    initialized = true;
  }
}

// ============================================================================
// Collection Management (lazy singletons)
// ============================================================================

const collections: Record<string, ZVecCollection> = {};

function getCollectionPath(name: string): string {
  return path.join(ZVEC_DATA_DIR, name);
}

/**
 * Get or create the fresh_memory zvec collection
 */
function getFreshMemoryCollection(): ZVecCollection {
  if (collections.fresh_memory) return collections.fresh_memory;

  ensureInitialized();

  const collectionPath = getCollectionPath('fresh_memory');

  try {
    collections.fresh_memory = ZVecOpen(collectionPath);
  } catch {
    // Collection doesn't exist yet, create it
    const schema = new ZVecCollectionSchema({
      name: 'fresh_memory',
      vectors: {
        name: 'embedding',
        dataType: ZVecDataType.VECTOR_FP32,
        dimension: EMBEDDING_DIMENSIONS,
        indexParams: {
          indexType: ZVecIndexType.HNSW,
          metricType: ZVecMetricType.COSINE,
        },
      },
      fields: [
        { name: 'profile_uuid', dataType: ZVecDataType.STRING, indexParams: { indexType: ZVecIndexType.INVERT } },
        { name: 'agent_uuid', dataType: ZVecDataType.STRING, nullable: true, indexParams: { indexType: ZVecIndexType.INVERT } },
      ],
    });

    collections.fresh_memory = ZVecCreateAndOpen(collectionPath, schema);
  }

  return collections.fresh_memory;
}

/**
 * Get or create the memory_ring zvec collection
 */
function getMemoryRingCollection(): ZVecCollection {
  if (collections.memory_ring) return collections.memory_ring;

  ensureInitialized();

  const collectionPath = getCollectionPath('memory_ring');

  try {
    collections.memory_ring = ZVecOpen(collectionPath);
  } catch {
    const schema = new ZVecCollectionSchema({
      name: 'memory_ring',
      vectors: {
        name: 'embedding',
        dataType: ZVecDataType.VECTOR_FP32,
        dimension: EMBEDDING_DIMENSIONS,
        indexParams: {
          indexType: ZVecIndexType.HNSW,
          metricType: ZVecMetricType.COSINE,
        },
      },
      fields: [
        { name: 'profile_uuid', dataType: ZVecDataType.STRING, indexParams: { indexType: ZVecIndexType.INVERT } },
        { name: 'agent_uuid', dataType: ZVecDataType.STRING, nullable: true, indexParams: { indexType: ZVecIndexType.INVERT } },
        { name: 'ring_type', dataType: ZVecDataType.STRING, indexParams: { indexType: ZVecIndexType.INVERT } },
      ],
    });

    collections.memory_ring = ZVecCreateAndOpen(collectionPath, schema);
  }

  return collections.memory_ring;
}

/**
 * Get or create the gut_patterns zvec collection
 */
function getGutPatternsCollection(): ZVecCollection {
  if (collections.gut_patterns) return collections.gut_patterns;

  ensureInitialized();

  const collectionPath = getCollectionPath('gut_patterns');

  try {
    collections.gut_patterns = ZVecOpen(collectionPath);
  } catch {
    const schema = new ZVecCollectionSchema({
      name: 'gut_patterns',
      vectors: {
        name: 'embedding',
        dataType: ZVecDataType.VECTOR_FP32,
        dimension: EMBEDDING_DIMENSIONS,
        indexParams: {
          indexType: ZVecIndexType.HNSW,
          metricType: ZVecMetricType.COSINE,
        },
      },
      fields: [
        { name: 'pattern_type', dataType: ZVecDataType.STRING, indexParams: { indexType: ZVecIndexType.INVERT } },
      ],
    });

    collections.gut_patterns = ZVecCreateAndOpen(collectionPath, schema);
  }

  return collections.gut_patterns;
}

// ============================================================================
// Upsert / Delete Operations
// ============================================================================

/**
 * Store or update a fresh memory embedding in zvec
 */
export function upsertFreshMemoryVector(
  uuid: string,
  embedding: number[],
  profileUuid: string,
  agentUuid?: string | null
): void {
  const collection = getFreshMemoryCollection();
  collection.upsertSync({
    id: uuid,
    vectors: { embedding },
    fields: {
      profile_uuid: profileUuid,
      agent_uuid: agentUuid ?? '',
    },
  });
}

/**
 * Store or update a memory ring embedding in zvec
 */
export function upsertMemoryRingVector(
  uuid: string,
  embedding: number[],
  profileUuid: string,
  ringType: string,
  agentUuid?: string | null
): void {
  const collection = getMemoryRingCollection();
  collection.upsertSync({
    id: uuid,
    vectors: { embedding },
    fields: {
      profile_uuid: profileUuid,
      agent_uuid: agentUuid ?? '',
      ring_type: ringType,
    },
  });
}

/**
 * Store or update a gut pattern embedding in zvec
 */
export function upsertGutPatternVector(
  uuid: string,
  embedding: number[],
  patternType: string
): void {
  const collection = getGutPatternsCollection();
  collection.upsertSync({
    id: uuid,
    vectors: { embedding },
    fields: { pattern_type: patternType },
  });
}

/**
 * Delete a vector from fresh memory collection
 */
export function deleteFreshMemoryVector(uuid: string): void {
  try {
    const collection = getFreshMemoryCollection();
    collection.deleteSync(uuid);
  } catch {
    // Silently ignore if not found
  }
}

/**
 * Delete a vector from memory ring collection
 */
export function deleteMemoryRingVector(uuid: string): void {
  try {
    const collection = getMemoryRingCollection();
    collection.deleteSync(uuid);
  } catch {
    // Silently ignore if not found
  }
}

/**
 * Delete a vector from gut patterns collection
 */
export function deleteGutPatternVector(uuid: string): void {
  try {
    const collection = getGutPatternsCollection();
    collection.deleteSync(uuid);
  } catch {
    // Silently ignore if not found
  }
}

// ============================================================================
// Search Operations
// ============================================================================

/**
 * Build a zvec filter expression string
 */
function buildFilter(conditions: Array<[string, string] | null>): string | undefined {
  const parts = conditions
    .filter((c): c is [string, string] => c !== null && c[1] !== '')
    .map(([field, value]) => `${field} = "${value}"`);

  return parts.length > 0 ? parts.join(' AND ') : undefined;
}

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
  const {
    profileUuid,
    queryEmbedding,
    topK = DEFAULT_TOP_K,
    threshold = SIMILARITY_THRESHOLD,
    agentUuid,
  } = params;

  const collection = getFreshMemoryCollection();

  const filter = buildFilter([
    ['profile_uuid', profileUuid],
    agentUuid ? ['agent_uuid', agentUuid] : null,
  ]);

  const results: ZVecDoc[] = collection.querySync({
    fieldName: 'embedding',
    vector: queryEmbedding,
    topk: topK,
    filter,
  });

  // zvec returns cosine similarity as score (higher = more similar)
  return results
    .filter(r => r.score >= threshold)
    .map(r => ({ uuid: r.id, score: r.score }));
}

/**
 * Search memory ring by semantic similarity (primary retrieval method)
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
    topK = DEFAULT_TOP_K,
    threshold = SIMILARITY_THRESHOLD,
    ringTypes,
    agentUuid,
  } = params;

  const collection = getMemoryRingCollection();

  // Build filter; for multiple ring types we over-fetch and filter in JS
  const filter = buildFilter([
    ['profile_uuid', profileUuid],
    agentUuid ? ['agent_uuid', agentUuid] : null,
    ringTypes && ringTypes.length === 1 ? ['ring_type', ringTypes[0]] : null,
  ]);

  const results: ZVecDoc[] = collection.querySync({
    fieldName: 'embedding',
    vector: queryEmbedding,
    topk: ringTypes && ringTypes.length > 1 ? topK * 3 : topK,
    filter,
  });

  let filtered = results.filter(r => r.score >= threshold);

  // Apply ring type filter if multiple types specified
  if (ringTypes && ringTypes.length > 1) {
    const typeSet = new Set(ringTypes);
    filtered = filtered.filter(r => typeSet.has(r.fields.ring_type as RingType));
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
  const {
    queryEmbedding,
    topK = 5,
    threshold = SIMILARITY_THRESHOLD,
  } = params;

  const collection = getGutPatternsCollection();

  const results: ZVecDoc[] = collection.querySync({
    fieldName: 'embedding',
    vector: queryEmbedding,
    topk: topK,
  });

  return results
    .filter(r => r.score >= threshold)
    .map(r => ({ uuid: r.id, score: r.score }));
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

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Close all open zvec collections (call on shutdown)
 */
export function closeAllCollections(): void {
  for (const [name, collection] of Object.entries(collections)) {
    try {
      collection.closeSync();
    } catch {
      // Ignore errors during cleanup
    }
    delete collections[name];
  }
}
