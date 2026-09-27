import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * docs.rag_document_id is a writable pointer: the exported updateDocRagId
 * action stores whatever id the caller sends onto a document they own. Delete
 * and re-index used to hand that pointer to ragService.removeDocument, which
 * deletes vectors and chunks by document id alone - so pointing your own
 * document at a victim's uuid and then deleting or re-indexing it erased the
 * victim's searchable content in another Hub.
 *
 * Every vector is keyed by the uuid of the document it was built from, so the
 * only id either action may remove is the one it just authorized.
 */

const CALLER = 'caller-user-id';
const OWN_DOC = '11111111-1111-4111-8111-111111111111';
const VICTIM_DOC = '99999999-9999-4999-8999-999999999999';
const OWN_HUB = '22222222-2222-4222-8222-222222222222';

const m = vi.hoisted(() => ({
  getDocByUuidFor: vi.fn(),
  removeDocument: vi.fn(async () => ({ success: true })),
  processDocument: vi.fn(async () => ({ success: true })),
  invalidateStorageCache: vi.fn(),
  updateDocRagIdFor: vi.fn(async () => ({ success: true })),
  hasIndexedChunks: vi.fn(),
  getDocuments: vi.fn(),
  selectRows: vi.fn(async () => [] as unknown[]),
}));

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: CALLER } })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {}, getAuthSession: vi.fn() }));
vi.mock('@/lib/auth-helpers', () => ({ withProfileAuth: vi.fn() }));
vi.mock('@/lib/library/queries', () => ({
  askKnowledgeBaseFor: vi.fn(),
  getDocByUuidFor: m.getDocByUuidFor,
  getDocsFor: vi.fn(),
  getDocumentVersionsFor: vi.fn(),
  getProjectStorageUsageFor: vi.fn(),
  updateDocRagIdFor: m.updateDocRagIdFor,
  WORKSPACE_STORAGE_LIMIT: 100 * 1024 * 1024,
}));
vi.mock('@/lib/rag-service', () => ({
  ragService: {
    removeDocument: m.removeDocument,
    processDocument: m.processDocument,
    invalidateStorageCache: m.invalidateStorageCache,
    hasIndexedChunks: m.hasIndexedChunks,
    getDocuments: m.getDocuments,
  },
}));
vi.mock('@/lib/rag/constants', () => ({ isRagSupported: () => true }));
vi.mock('@/lib/rag/text-extract', () => ({ extractTextFromFile: async () => 'document text' }));
vi.mock('@/lib/secure-path-builder', () => ({
  buildSecurePath: (base: string, rel: string) => `${base}/${rel}`,
  getSecureBaseUploadDir: () => '/uploads',
  validatePathComponent: (value: string) => value,
}));
vi.mock('@/lib/analytics-cache', () => ({ analyticsCache: { invalidateProfile: vi.fn() } }));
vi.mock('fs/promises', () => {
  const fsPromises = {
    mkdir: vi.fn(async () => undefined),
    unlink: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
  };
  return { ...fsPromises, default: fsPromises };
});
vi.mock('@/db', () => ({
  db: {
    delete: () => ({ where: async () => undefined }),
    select: () => ({
      from: () => ({
        where: () => {
          const rows = m.selectRows();
          return Object.assign(rows, { orderBy: () => rows });
        },
      }),
    }),
    query: { projectsTable: { findFirst: async () => null } },
  },
}));

const library = await import('@/app/actions/library');
const { deleteDoc, manualRepairDocumentRagIds, reindexDocument, repairMissingRagDocumentIds } = library;

/** An owned document whose rag pointer has been aimed at someone else's. */
const repointedDoc = () => ({
  uuid: OWN_DOC,
  user_id: CALLER,
  project_uuid: OWN_HUB,
  name: 'mine',
  file_name: 'mine.txt',
  file_path: `${CALLER}/mine.txt`,
  mime_type: 'text/plain',
  rag_document_id: VICTIM_DOC,
  created_at: new Date(),
  updated_at: new Date(),
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ENABLE_RAG = 'true';
  m.getDocByUuidFor.mockResolvedValue(repointedDoc());
});

describe('deleteDoc', () => {
  it('removes the vectors of the document it deleted, not the one its pointer names', async () => {
    const result = await deleteDoc(OWN_DOC, OWN_HUB);

    expect(result.success).toBe(true);
    expect(m.removeDocument).toHaveBeenCalledWith(OWN_DOC, OWN_HUB);
    expect(m.removeDocument).not.toHaveBeenCalledWith(VICTIM_DOC, expect.anything());
  });

  it('scopes the removal to the document’s own Hub when the caller names none', async () => {
    await deleteDoc(OWN_DOC);

    expect(m.removeDocument).toHaveBeenCalledWith(OWN_DOC, OWN_HUB);
    expect(m.removeDocument).not.toHaveBeenCalledWith(expect.anything(), CALLER);
  });

  it('removes nothing when the document is not the caller’s', async () => {
    m.getDocByUuidFor.mockResolvedValue(null);

    const result = await deleteDoc(VICTIM_DOC, OWN_HUB);

    expect(result.success).toBe(false);
    expect(m.removeDocument).not.toHaveBeenCalled();
  });
});

describe('reindexDocument', () => {
  it('clears only the document it is re-indexing', async () => {
    const result = await reindexDocument(OWN_DOC, OWN_HUB);

    expect(result.success).toBe(true);
    expect(m.removeDocument).toHaveBeenCalledWith(OWN_DOC, OWN_HUB);
    expect(m.removeDocument).not.toHaveBeenCalledWith(VICTIM_DOC, expect.anything());
    expect(m.processDocument).toHaveBeenCalledWith(OWN_DOC, OWN_HUB, 'document text', 'mine.txt');
  });
});

describe('deleteDoc outside a Hub', () => {
  it('removes no vectors for a document that belongs to no Hub', async () => {
    m.getDocByUuidFor.mockResolvedValue({ ...repointedDoc(), project_uuid: null });

    const result = await deleteDoc(OWN_DOC);

    expect(result.success).toBe(true);
    expect(m.removeDocument).not.toHaveBeenCalled();
  });
});

/**
 * The browser used to be able to write any rag pointer onto its own document
 * through updateDocRagId, and the repair actions pointed an un-indexed
 * document at whichever Hub document had a similar file name. A pointer may
 * only name the document itself, and only once its own chunks are indexed.
 */
describe('rag pointer writes from the browser', () => {
  it('no longer exposes a client-chosen pointer write', () => {
    expect('updateDocRagId' in library).toBe(false);
  });

  const orphan = (uuid: string, fileName: string) => ({
    uuid,
    name: fileName,
    file_name: fileName,
    file_path: `${CALLER}/${fileName}`,
    mime_type: 'text/markdown',
    source: 'ai_generated',
    project_uuid: OWN_HUB,
    rag_document_id: null,
    created_at: new Date(),
  });
  const UNINDEXED_DOC = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    m.selectRows.mockResolvedValue([orphan(OWN_DOC, 'mine.txt'), orphan(UNINDEXED_DOC, 'other.txt')]);
    // A similarly named document elsewhere in the Hub - what the old
    // file-name matching would have pointed these at.
    m.getDocuments.mockResolvedValue({
      success: true,
      documents: [['mine.txt', VICTIM_DOC], ['other.txt', VICTIM_DOC]],
    });
    m.hasIndexedChunks.mockImplementation(
      async (doc: string, hub: string) => doc === OWN_DOC && hub === OWN_HUB
    );
  });

  it.each([
    ['manualRepairDocumentRagIds', () => manualRepairDocumentRagIds(OWN_HUB)],
    ['repairMissingRagDocumentIds', () => repairMissingRagDocumentIds(OWN_HUB)],
  ])('%s links a document only to its own indexed chunks', async (_name, repair) => {
    const result = await repair();

    expect(result.success).toBe(true);
    expect(m.updateDocRagIdFor).toHaveBeenCalledWith(CALLER, OWN_DOC, OWN_DOC);
    for (const [, docUuid, pointer] of m.updateDocRagIdFor.mock.calls as unknown as string[][]) {
      expect(pointer).toBe(docUuid);
    }
    expect(m.updateDocRagIdFor).not.toHaveBeenCalledWith(CALLER, UNINDEXED_DOC, expect.anything());
  });
});
