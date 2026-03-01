import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock @langchain/openai
vi.mock('@langchain/openai', () => ({
  OpenAIEmbeddings: vi.fn().mockImplementation(() => ({
    embedQuery: vi.fn().mockResolvedValue(Array.from({ length: 1536 }, () => 0.1)),
    embedDocuments: vi.fn().mockResolvedValue([
      Array.from({ length: 1536 }, () => 0.1),
      Array.from({ length: 1536 }, () => 0.2),
    ]),
  })),
}));

import {
  generateEmbedding,
  generateEmbeddings,
  estimateTokenCount,
  EMBEDDING_DIMENSIONS,
} from '@/lib/vectors/embedding-service';

describe('Shared Embedding Service', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('should export correct embedding dimension', () => {
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
  });

  it('should generate a single embedding', async () => {
    const result = await generateEmbedding('Hello world');
    expect(result).toHaveLength(1536);
    expect(typeof result[0]).toBe('number');
  });

  it('should generate batch embeddings', async () => {
    const results = await generateEmbeddings(['Hello', 'World']);
    expect(results).toHaveLength(2);
    results.forEach((emb) => {
      expect(emb).toHaveLength(1536);
    });
  });

  it('should return empty array for empty batch', async () => {
    const results = await generateEmbeddings([]);
    expect(results).toHaveLength(0);
  });

  it('should estimate token count', () => {
    const count = estimateTokenCount('Hello world test');
    expect(count).toBeGreaterThan(0);
    // ~4 chars per token, "Hello world test" = 16 chars / 4 = 4 tokens
    expect(count).toBe(4);
  });
});
