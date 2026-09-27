import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * docs.rag_document_id says "this document is indexed, under this id". In the
 * embedded index every document is indexed under its own uuid, so the only
 * value it can legitimately hold is the document's own uuid. Any other value
 * is a pointer at somebody else's index - which delete and re-index then
 * acted on - so the write refuses it.
 */

const USER = 'owner-user-id';
const PROJECT = '11111111-1111-4111-8111-111111111111';
const OWN_DOC = '22222222-2222-4222-8222-222222222222';
const FOREIGN_DOC = '99999999-9999-4999-8999-999999999999';

const m = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  selectRows: vi.fn(),
  queryForResponse: vi.fn(),
  getDocuments: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          m.updates.push(values);
        },
      }),
    }),
    select: () => ({ from: () => ({ where: async () => m.selectRows() }) }),
    query: { projectsTable: { findFirst: async () => ({ uuid: PROJECT }) } },
  },
}));
vi.mock('@/lib/rag-service', () => ({
  ragService: {
    queryForResponse: m.queryForResponse,
    getDocuments: m.getDocuments,
    getStorageStats: vi.fn(),
  },
}));
vi.mock('@/lib/sanitization', () => ({ sanitizeToPlainText: (s: string) => s }));

const { askKnowledgeBaseFor, updateDocRagIdFor } = await import('@/lib/library/queries');

beforeEach(() => {
  vi.clearAllMocks();
  m.updates.length = 0;
});

describe('updateDocRagIdFor', () => {
  it('points a document at its own index', async () => {
    const result = await updateDocRagIdFor(USER, OWN_DOC, OWN_DOC);

    expect(result.success).toBe(true);
    expect(m.updates).toEqual([expect.objectContaining({ rag_document_id: OWN_DOC })]);
  });

  it('refuses to point a document at another document’s index', async () => {
    const result = await updateDocRagIdFor(USER, OWN_DOC, FOREIGN_DOC);

    expect(result.success).toBe(false);
    expect(m.updates).toEqual([]);
  });
});

describe('askKnowledgeBaseFor', () => {
  it('does not repoint a document at a search hit that is not itself', async () => {
    // A hit from another document in the Hub whose file name happens to match
    // one of the caller's un-indexed documents.
    m.queryForResponse.mockResolvedValue({
      success: true,
      response: 'answer',
      documentIds: [FOREIGN_DOC],
    });
    m.getDocuments.mockResolvedValue({ success: true, documents: [['notes.md', FOREIGN_DOC]] });
    m.selectRows.mockResolvedValue([
      {
        uuid: OWN_DOC,
        name: 'notes.md',
        file_name: 'notes.md',
        rag_document_id: null,
        source: 'upload',
        ai_metadata: null,
      },
    ]);

    const result = await askKnowledgeBaseFor(USER, 'what is in my notes', PROJECT);

    expect(result.success).toBe(true);
    // The pointer write is fire-and-forget; let it land if it was issued.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(m.updates).toEqual([]);
  });
});
