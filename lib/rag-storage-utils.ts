/**
 * Shared utilities for RAG storage estimation
 */

// Constants for storage calculation
export const AVERAGE_CHUNKS_PER_DOCUMENT = 25;
export const EMBEDDING_DIMENSION = 1536;
export const BYTES_PER_FLOAT32 = 4;
export const BYTES_PER_VECTOR = EMBEDDING_DIMENSION * BYTES_PER_FLOAT32;
export const METADATA_OVERHEAD_FACTOR = 1.1; // 10% overhead for indexes and metadata

export interface StorageEstimation {
  documentsCount: number;
  totalChunks: number;
  estimatedStorageMb: number;
  vectorsCount: number;
  embeddingDimension: number;
  isEstimate: boolean;
}

/**
 * Estimate storage based on document count
 * @param documentsCount Number of documents
 * @param chunksPerDoc Average chunks per document (optional)
 * @returns Storage estimation
 */
export function estimateStorageFromDocumentCount(
  documentsCount: number,
  chunksPerDoc: number = AVERAGE_CHUNKS_PER_DOCUMENT
): StorageEstimation {
  const totalChunks = documentsCount * chunksPerDoc;
  const estimatedStorageBytes = totalChunks * BYTES_PER_VECTOR;
  const estimatedStorageMb = (estimatedStorageBytes * METADATA_OVERHEAD_FACTOR) / (1024 * 1024);

  return {
    documentsCount,
    totalChunks,
    estimatedStorageMb: Math.round(estimatedStorageMb * 10) / 10, // Round to 1 decimal
    vectorsCount: totalChunks,
    embeddingDimension: EMBEDDING_DIMENSION,
    isEstimate: true,
  };
}

/**
 * Calculate storage from actual vector count
 * @param vectorCount Number of vectors
 * @param documentsCount Number of documents
 * @returns Storage estimation
 */
export function calculateStorageFromVectorCount(
  vectorCount: number,
  documentsCount: number
): StorageEstimation {
  const estimatedStorageBytes = vectorCount * BYTES_PER_VECTOR;
  const estimatedStorageMb = (estimatedStorageBytes * METADATA_OVERHEAD_FACTOR) / (1024 * 1024);

  return {
    documentsCount,
    totalChunks: vectorCount,
    estimatedStorageMb: Math.round(estimatedStorageMb * 100) / 100, // Round to 2 decimals
    vectorsCount: vectorCount,
    embeddingDimension: EMBEDDING_DIMENSION,
    isEstimate: false,
  };
}