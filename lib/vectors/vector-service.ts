/**
 * Shared Vector Service
 *
 * In-process vector operations using zvec. Provides a unified interface
 * for RAG, Memory, and CBP vector storage and search.
 *
 * Each domain gets its own zvec collection with domain-specific fields.
 * All collections share the same HNSW index configuration and embedding dimensions.
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

let initialized = false;

function ensureInitialized(): void {
  if (!initialized) {
    ZVecInitialize({ logLevel: 2 }); // WARN
    initialized = true;
  }
}

// ─── Collection Management ─────────────────────────────────────────

const collections: Record<string, ZVecCollection> = {};

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

function getCollection(domain: VectorDomain): ZVecCollection {
  if (collections[domain]) return collections[domain];

  ensureInitialized();

  const collectionPath = path.join(ZVEC_DATA_DIR, domain);
  const fields = DOMAIN_FIELDS[domain];

  try {
    collections[domain] = ZVecOpen(collectionPath);
  } catch {
    // If the directory exists but isn't a valid collection, remove it first
    const fs = require('fs');
    if (fs.existsSync(collectionPath)) {
      fs.rmSync(collectionPath, { recursive: true });
    }
    const schema = new ZVecCollectionSchema({
      name: domain,
      vectors: EMBEDDING_VECTOR_CONFIG,
      fields,
    });
    collections[domain] = ZVecCreateAndOpen(collectionPath, schema);
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
    const info = (collection as any).infoSync?.() || {};
    return { domain, count: info.count || info.total || 0 };
  } catch {
    return { domain, count: 0 };
  }
}
