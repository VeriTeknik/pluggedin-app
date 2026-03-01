/**
 * Shared Vector Service
 *
 * In-process vector operations using zvec. Provides a unified interface
 * for RAG, Memory, and CBP vector storage and search.
 *
 * Each domain gets its own zvec collection with domain-specific fields.
 * All collections share the same HNSW index configuration and embedding dimensions.
 *
 * PRODUCTION NOTE: zvec uses RocksDB which enforces a single-writer constraint.
 * Only one OS process can hold the write lock on a collection at a time.
 * In multi-worker deployments (PM2 cluster, multiple Kubernetes replicas),
 * vector writes must be routed to a single worker or serialized via an
 * external queue. Reads are safe from multiple processes once the lock is
 * released after write. For multi-replica setups, consider a dedicated
 * vector-write worker or migrating to a client/server vector store.
 */

import {
  type ZVecCollection,
  ZVecCollectionSchema,
  ZVecCreateAndOpen,
  ZVecDataType,
  ZVecIndexType,
  ZVecInitialize,
  ZVecMetricType,
  ZVecOpen,
} from '@zvec/zvec';
import { existsSync, rmSync } from 'fs';
import path from 'path';

import type {
  VectorDeleteByFilterParams,
  VectorDeleteParams,
  VectorDomain,
  VectorInsertParams,
  VectorSearchParams,
  VectorSearchResult,
  VectorStats,
} from './types';
import { EMBEDDING_DIMENSIONS } from './types';

// ─── Configuration ─────────────────────────────────────────────────

const ZVEC_DATA_DIR = process.env.ZVEC_DATA_PATH
  || process.env.MEMORY_VECTOR_DATA_DIR
  || path.join(process.cwd(), 'data', 'vectors');

// Persist zvec state on globalThis to survive Next.js HMR reloads.
// Without this, module reload loses collection handles while RocksDB
// still holds file locks, causing "lock hold by current process" errors.
const globalForZvec = globalThis as typeof globalThis & {
  __zvecInitialized?: boolean;
  __zvecCollections?: Record<string, ZVecCollection>;
};

function ensureInitialized(): void {
  if (!globalForZvec.__zvecInitialized) {
    ZVecInitialize({ logLevel: 2 }); // WARN
    globalForZvec.__zvecInitialized = true;
  }
}

// ─── Collection Management ─────────────────────────────────────────

if (!globalForZvec.__zvecCollections) {
  globalForZvec.__zvecCollections = {};
}
const collections = globalForZvec.__zvecCollections;

const INVERT_INDEX = { indexType: ZVecIndexType.INVERT } as const;

const EMBEDDING_VECTOR_CONFIG = {
  name: 'embedding',
  dataType: ZVecDataType.VECTOR_FP32,
  dimension: EMBEDDING_DIMENSIONS,
  indexParams: {
    indexType: ZVecIndexType.HNSW,
    metricType: ZVecMetricType.COSINE,
  },
} as const;

/**
 * Domain-specific collection field definitions.
 * Each domain has its own set of filterable fields stored alongside vectors.
 */
const DOMAIN_FIELDS: Record<VectorDomain, ConstructorParameters<typeof ZVecCollectionSchema>[0]['fields']> = {
  rag: [
    { name: 'project_uuid', dataType: ZVecDataType.STRING, indexParams: INVERT_INDEX },
    { name: 'document_uuid', dataType: ZVecDataType.STRING, indexParams: INVERT_INDEX },
    { name: 'chunk_uuid', dataType: ZVecDataType.STRING, indexParams: INVERT_INDEX },
  ],
  fresh_memory: [
    { name: 'profile_uuid', dataType: ZVecDataType.STRING, indexParams: INVERT_INDEX },
    { name: 'agent_uuid', dataType: ZVecDataType.STRING, nullable: true, indexParams: INVERT_INDEX },
  ],
  memory_ring: [
    { name: 'profile_uuid', dataType: ZVecDataType.STRING, indexParams: INVERT_INDEX },
    { name: 'agent_uuid', dataType: ZVecDataType.STRING, nullable: true, indexParams: INVERT_INDEX },
    { name: 'ring_type', dataType: ZVecDataType.STRING, indexParams: INVERT_INDEX },
  ],
  gut_patterns: [
    { name: 'pattern_type', dataType: ZVecDataType.STRING, indexParams: INVERT_INDEX },
  ],
};

function createCollection(collectionPath: string, domain: VectorDomain, fields: (typeof DOMAIN_FIELDS)[VectorDomain]): ZVecCollection {
  if (existsSync(collectionPath)) {
    rmSync(collectionPath, { recursive: true });
  }
  const schema = new ZVecCollectionSchema({
    name: domain,
    vectors: EMBEDDING_VECTOR_CONFIG,
    fields,
  });
  return ZVecCreateAndOpen(collectionPath, schema);
}

function isIndexHealthy(collection: ZVecCollection): boolean {
  try {
    const { docCount, indexCompleteness } = collection.stats;
    if (docCount === 0) return true; // Empty collection is healthy
    // If we have documents but embedding index completeness is 0, the index is corrupted
    const embeddingCompleteness = indexCompleteness?.embedding;
    if (typeof embeddingCompleteness === 'number' && embeddingCompleteness === 0) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function getCollection(domain: VectorDomain): ZVecCollection {
  if (collections[domain]) return collections[domain];

  ensureInitialized();

  const collectionPath = path.join(ZVEC_DATA_DIR, domain);
  const fields = DOMAIN_FIELDS[domain];

  try {
    const col = ZVecOpen(collectionPath);
    // Validate index health - corrupted indexes silently return empty results
    if (!isIndexHealthy(col)) {
      console.warn(`[zvec] Corrupted index detected for "${domain}", rebuilding collection`);
      try { col.closeSync(); } catch { /* ignore */ }
      collections[domain] = createCollection(collectionPath, domain, fields);
    } else {
      collections[domain] = col;
    }
  } catch (openErr: any) {
    const msg = openErr?.message || '';
    // Lock held by another process - don't destroy data, propagate error
    if (msg.includes('lock hold by') || msg.includes('No locks available')) {
      throw openErr;
    }
    // Invalid or missing collection - safe to (re)create
    collections[domain] = createCollection(collectionPath, domain, fields);
  }

  return collections[domain];
}

// ─── Filter Helpers ───────────────────────────────────────────────────

/** Allowed field names for zvec filter expressions to prevent field injection */
const ALLOWED_FILTER_FIELDS: ReadonlySet<string> = new Set([
  'project_uuid', 'document_uuid', 'chunk_uuid',
  'profile_uuid', 'agent_uuid', 'ring_type', 'pattern_type',
]);

/**
 * Sanitize a value for use in zvec filter expressions.
 * Removes double quotes and backslashes to prevent filter injection.
 */
function sanitizeFilterValue(value: string): string {
  return value.replace(/["\\]/g, '');
}

/**
 * Build a safe zvec filter expression from field/value pairs.
 * Field names are validated against an allowlist and values are sanitized.
 */
export function buildFilter(
  conditions: Array<[field: string, value: string] | null>
): string | undefined {
  const parts = conditions
    .filter((c): c is [string, string] => c !== null && c[1] !== '')
    .map(([field, value]) => {
      if (!ALLOWED_FILTER_FIELDS.has(field)) {
        throw new Error(`Invalid filter field: ${field}`);
      }
      return `${field} = "${sanitizeFilterValue(value)}"`;
    });

  return parts.length > 0 ? parts.join(' AND ') : undefined;
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Insert or update a vector in the specified domain collection.
 */
export function upsertVector(params: VectorInsertParams): void {
  const collection = getCollection(params.domain);
  collection.upsertSync({
    id: params.id,
    vectors: { embedding: params.embedding },
    fields: params.fields,
  });
}

/**
 * Batch insert vectors.
 *
 * NOTE: upsertSync and optimizeSync are synchronous and block the event loop.
 * For large batches or high-concurrency scenarios, consider offloading to a
 * Worker thread. optimizeSync rebuilds the HNSW index (O(n log n) in total
 * vectors) and is called per-batch to prevent corruption; if performance
 * becomes an issue, defer optimization to a background job triggered when
 * indexCompleteness drops below a threshold.
 */
export function upsertVectors(paramsList: VectorInsertParams[]): void {
  if (paramsList.length === 0) return;

  // Group by domain
  const byDomain = new Map<VectorDomain, VectorInsertParams[]>();
  for (const p of paramsList) {
    const list = byDomain.get(p.domain) || [];
    list.push(p);
    byDomain.set(p.domain, list);
  }

  for (const [domain, params] of byDomain) {
    const collection = getCollection(domain);
    const docs = params.map((p) => ({
      id: p.id,
      vectors: { embedding: p.embedding },
      fields: p.fields,
    }));
    collection.upsertSync(docs);
    // Build/optimize HNSW index after batch inserts to prevent corruption
    collection.optimizeSync();
  }
}

/**
 * Search for similar vectors in the specified domain.
 */
export function searchVectors(params: VectorSearchParams): VectorSearchResult[] {
  const collection = getCollection(params.domain);
  const topK = params.topK ?? 10;

  const queryParams: Record<string, unknown> = {
    fieldName: 'embedding',
    vector: params.embedding,
    topk: topK,
    includeVector: false,
  };

  if (params.filter) {
    queryParams.filter = params.filter;
  }

  const results = collection.querySync(queryParams);

  return (results || [])
    .map((r: any) => ({
      id: r.id,
      score: r.score ?? r.distance ?? 0,
      fields: r.fields ?? {},
    }))
    .filter((r: VectorSearchResult) =>
      params.threshold ? r.score >= params.threshold : true
    );
}

/**
 * Delete vectors by ID from the specified domain.
 */
export function deleteVectors(params: VectorDeleteParams): void {
  if (!params.ids || params.ids.length === 0) return;
  const collection = getCollection(params.domain);
  collection.deleteSync(params.ids);
}

/**
 * Delete vectors matching a filter expression.
 */
export function deleteVectorsByFilter(params: VectorDeleteByFilterParams): void {
  const collection = getCollection(params.domain);
  collection.deleteByFilterSync(params.filter);
}

/**
 * Get stats for a domain collection.
 */
export function getVectorStats(domain: VectorDomain): VectorStats {
  try {
    const collection = getCollection(domain);
    return { domain, count: collection.stats.docCount || 0 };
  } catch {
    return { domain, count: 0 };
  }
}

/**
 * Reset a domain collection by deleting and recreating it.
 * Use this to recover from corrupted indexes.
 */
export function resetCollection(domain: VectorDomain): void {
  const collectionPath = path.join(ZVEC_DATA_DIR, domain);
  const fields = DOMAIN_FIELDS[domain];

  // Close existing handle
  if (collections[domain]) {
    try { collections[domain].closeSync(); } catch { /* ignore */ }
    delete collections[domain];
  }

  ensureInitialized();
  collections[domain] = createCollection(collectionPath, domain, fields);
}
