import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock vector service
vi.mock('@/lib/vectors/vector-service', () => ({
  upsertVectors: vi.fn(),
  searchVectors: vi.fn().mockReturnValue([
    { id: 'vec-1', score: 0.95, fields: { chunk_uuid: 'chunk-1', project_uuid: 'proj-1' } },
  ]),
  deleteVectorsByFilter: vi.fn(),
  getVectorStats: vi.fn().mockReturnValue({ domain: 'rag', count: 10 }),
}));

// Mock embedding service
vi.mock('@/lib/vectors/embedding-service', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(Array(1536).fill(0.1)),
  generateEmbeddings: vi.fn().mockResolvedValue([
    Array(1536).fill(0.1),
    Array(1536).fill(0.2),
  ]),
  EMBEDDING_DIMENSIONS: 1536,
}));

// Mock chunking
vi.mock('@/lib/rag/chunking', () => ({
  splitTextIntoChunks: vi.fn().mockReturnValue(['chunk 1 text', 'chunk 2 text']),
}));

// Mock database
vi.mock('@/db', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { uuid: 'chunk-uuid-1', zvec_vector_id: 'vec-1' },
          { uuid: 'chunk-uuid-2', zvec_vector_id: 'vec-2' },
        ]),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { uuid: 'chunk-1', chunk_text: 'chunk text', document_uuid: 'doc-1' },
        ]),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock('@/db/schema', () => ({
  documentChunksTable: { uuid: 'uuid', chunk_text: 'chunk_text', document_uuid: 'document_uuid', project_uuid: 'project_uuid' },
  docsTable: { uuid: 'uuid', name: 'name', rag_document_id: 'rag_document_id', project_uuid: 'project_uuid' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
  isNotNull: vi.fn(),
  sql: vi.fn(),
}));

import { RagService } from '@/lib/rag-service';

describe('RagService (embedded zvec)', () => {
  let service: RagService;

  beforeEach(() => {
    process.env.ENABLE_RAG = 'true';
    service = new RagService();
  });

  it('should export RagService class', () => {
    expect(RagService).toBeDefined();
  });

  it('should check ENABLE_RAG flag', () => {
    expect(service.isEnabled()).toBe(true);
    process.env.ENABLE_RAG = 'false';
    service = new RagService();
    expect(service.isEnabled()).toBe(false);
  });

  it('should have queryForResponse method', () => {
    expect(typeof service.queryForResponse).toBe('function');
  });

  it('should have queryForContext method', () => {
    expect(typeof service.queryForContext).toBe('function');
  });

  it('should have processDocument method', () => {
    expect(typeof service.processDocument).toBe('function');
  });

  it('should have removeDocument method', () => {
    expect(typeof service.removeDocument).toBe('function');
  });

  it('should have getStorageStats method', () => {
    expect(typeof service.getStorageStats).toBe('function');
  });

  it('should return error when RAG is disabled', async () => {
    process.env.ENABLE_RAG = 'false';
    service = new RagService();
    const result = await service.queryForResponse('proj-1', 'test query');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not enabled');
  });
});
