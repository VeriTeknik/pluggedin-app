/**
 * Memory Embedding Service
 *
 * Re-exports from the shared vector embedding service.
 * Kept for backward compatibility with memory service imports.
 */

export {
  generateEmbedding,
  generateEmbeddings,
  estimateTokenCount,
} from '@/lib/vectors/embedding-service';
