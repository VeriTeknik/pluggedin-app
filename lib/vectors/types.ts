/**
 * Shared vector types for RAG, Memory, and CBP systems.
 * All vector operations across the platform use these types.
 */

/** Which subsystem owns the vectors */
export type VectorDomain = 'rag' | 'fresh_memory' | 'memory_ring' | 'gut_patterns';

/** Embedding model → dimension mapping for OpenAI models */
const MODEL_DIMENSIONS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};

/** Embedding model configuration */
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

/** Resolved embedding dimensions based on configured model */
export const EMBEDDING_DIMENSIONS: number = (() => {
  const model = process.env.EMBEDDING_MODEL || process.env.MEMORY_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const dims = MODEL_DIMENSIONS[model];
  if (!dims) {
    throw new Error(
      `[vectors] Unknown embedding model "${model}". ` +
      `Known models: ${Object.keys(MODEL_DIMENSIONS).join(', ')}`
    );
  }
  return dims;
})();

/** Parameters for inserting a vector */
export interface VectorInsertParams {
  id: string;
  embedding: number[];
  domain: VectorDomain;
  fields: Record<string, string>;
}

/** Parameters for searching vectors */
export interface VectorSearchParams {
  embedding: number[];
  domain: VectorDomain;
  topK?: number;
  filter?: string;
  threshold?: number;
}

/** A single search result */
export interface VectorSearchResult {
  id: string;
  score: number;
  fields: Record<string, string>;
}

/** Parameters for deleting vectors */
export interface VectorDeleteParams {
  ids?: string[];
  domain: VectorDomain;
  filter?: string;
}

/** Parameters for deleting by filter */
export interface VectorDeleteByFilterParams {
  domain: VectorDomain;
  filter: string;
}

/** Collection statistics */
export interface VectorStats {
  domain: VectorDomain;
  count: number;
}
