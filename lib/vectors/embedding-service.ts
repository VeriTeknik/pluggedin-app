/**
 * Shared Embedding Service
 *
 * Generates vector embeddings using the configured AI provider.
 * Supports OpenAI, Gemini, and future providers via the abstraction layer.
 * Used by RAG, Memory, and CBP systems.
 */

import { getEmbeddingProvider } from '@/lib/ai';

export { getResolvedEmbeddingDimensions } from './types';

/**
 * Generate embedding vector for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  return getEmbeddingProvider().embed(text);
}

/**
 * Generate embedding vectors for multiple texts (batch)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  return getEmbeddingProvider().embedBatch(texts);
}

/**
 * Estimate token count for a text (rough approximation: ~4 chars per token)
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
