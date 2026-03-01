import { describe, expect, it } from 'vitest';

import type {
  VectorDomain,
  VectorInsertParams,
  VectorSearchParams,
  VectorSearchResult,
  VectorDeleteParams,
} from '@/lib/vectors/types';

describe('Shared Vector Types', () => {
  it('should define VectorDomain union', () => {
    const domains: VectorDomain[] = ['rag', 'fresh_memory', 'memory_ring', 'gut_patterns'];
    expect(domains).toHaveLength(4);
  });

  it('should define VectorInsertParams', () => {
    const params: VectorInsertParams = {
      id: 'vec-1',
      embedding: [0.1, 0.2, 0.3],
      domain: 'rag',
      fields: { project_uuid: 'proj-1', document_uuid: 'doc-1' },
    };
    expect(params.domain).toBe('rag');
  });

  it('should define VectorSearchParams', () => {
    const params: VectorSearchParams = {
      embedding: [0.1, 0.2, 0.3],
      domain: 'rag',
      topK: 5,
      filter: 'project_uuid = "proj-1"',
    };
    expect(params.topK).toBe(5);
  });

  it('should define VectorSearchResult', () => {
    const result: VectorSearchResult = {
      id: 'vec-1',
      score: 0.95,
      fields: { project_uuid: 'proj-1' },
    };
    expect(result.score).toBe(0.95);
  });

  it('should define VectorDeleteParams', () => {
    const params: VectorDeleteParams = {
      ids: ['vec-1', 'vec-2'],
      domain: 'rag',
    };
    expect(params.ids).toHaveLength(2);
  });
});
