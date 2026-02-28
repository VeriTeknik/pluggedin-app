/**
 * Embedding Service
 *
 * Generates vector embeddings from text content using OpenAI's embedding API.
 * Uses @langchain/openai which is already a project dependency.
 */

import { OpenAIEmbeddings } from '@langchain/openai';

import { DEFAULT_EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from './constants';

let embeddingsInstance: OpenAIEmbeddings | null = null;

function getEmbeddings(): OpenAIEmbeddings {
  if (!embeddingsInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for memory embeddings');
    }

    embeddingsInstance = new OpenAIEmbeddings({
      openAIApiKey: apiKey,
      modelName: process.env.MEMORY_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
    });
  }
  return embeddingsInstance;
}

/**
 * Generate embedding vector for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const embeddings = getEmbeddings();
  return embeddings.embedQuery(text);
}

/**
 * Generate embedding vectors for multiple texts (batch)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const embeddings = getEmbeddings();
  return embeddings.embedDocuments(texts);
}

/**
 * Estimate token count for a text (rough approximation: ~4 chars per token)
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
