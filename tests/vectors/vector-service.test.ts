import { describe, expect, it, vi } from 'vitest';

// Mock @zvec/zvec
vi.mock('@zvec/zvec', () => {
  const mockCollection = {
    upsertSync: vi.fn(),
    querySync: vi.fn().mockReturnValue([
      { id: 'vec-1', score: 0.95, fields: { project_uuid: 'proj-1' } },
    ]),
    deleteSync: vi.fn(),
    deleteByFilterSync: vi.fn(),
  };

  return {
    ZVecInitialize: vi.fn(),
    ZVecOpen: vi.fn().mockReturnValue(mockCollection),
    ZVecCreateAndOpen: vi.fn().mockReturnValue(mockCollection),
    ZVecCollectionSchema: vi.fn(),
    ZVecDataType: { VECTOR_FP32: 'VECTOR_FP32', STRING: 'STRING' },
    ZVecIndexType: { HNSW: 'HNSW', INVERT: 'INVERT' },
    ZVecMetricType: { COSINE: 'COSINE' },
  };
});

import {
  upsertVector,
  searchVectors,
  deleteVectors,
  deleteVectorsByFilter,
} from '@/lib/vectors/vector-service';

describe('Shared Vector Service', () => {
  it('should upsert a vector', () => {
    expect(() => upsertVector({
      id: 'vec-1',
      embedding: Array(1536).fill(0.1),
      domain: 'rag',
      fields: { project_uuid: 'proj-1' },
    })).not.toThrow();
  });

  it('should search vectors', () => {
    const results = searchVectors({
      embedding: Array(1536).fill(0.1),
      domain: 'rag',
      topK: 5,
    });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('vec-1');
    expect(results[0].score).toBe(0.95);
  });

  it('should delete vectors by ID', () => {
    expect(() => deleteVectors({
      ids: ['vec-1'],
      domain: 'rag',
    })).not.toThrow();
  });

  it('should delete vectors by filter', () => {
    expect(() => deleteVectorsByFilter({
      domain: 'rag',
      filter: 'document_uuid = "doc-1"',
    })).not.toThrow();
  });
});
