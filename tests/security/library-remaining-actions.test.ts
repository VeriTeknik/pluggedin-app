import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const dbFindFirst = vi.fn(async () => undefined);
const dbInsert = vi.fn();
const dbSelect = vi.fn();

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {}, getAuthSession: vi.fn() }));
vi.mock('@/lib/auth-helpers', () => ({
  withProfileAuth: vi.fn(async () => {
    throw new Error('Unauthorized - you do not have access to this profile');
  }),
}));
vi.mock('@/db', () => ({
  db: {
    query: {
      docsTable: { findFirst: dbFindFirst, findMany: vi.fn(async () => []) },
      projectsTable: { findFirst: dbFindFirst },
    },
    insert: dbInsert,
    select: dbSelect,
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

const lib = await import('@/app/actions/library');

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue(null);
});

/**
 * The reads were closed first, but six exports in this file still took a
 * `userId` or `profileUuid` from the caller: createDoc, deleteDoc,
 * reindexDocument, manualRepairDocumentRagIds, repairMissingRagDocumentIds and
 * trackDocumentView. Every export here is a public POST endpoint, so each let
 * a caller act as somebody else — uploading into, deleting from, or reindexing
 * another tenant's library.
 */
describe('the rest of the library surface derives its identity too', () => {
  const cases: Array<[string, () => Promise<unknown>]> = [
    ['createDoc', () => lib.createDoc(new FormData())],
    ['deleteDoc', () => lib.deleteDoc('doc-uuid')],
    ['reindexDocument', () => lib.reindexDocument('doc-uuid')],
    ['manualRepairDocumentRagIds', () => lib.manualRepairDocumentRagIds()],
    ['repairMissingRagDocumentIds', () => lib.repairMissingRagDocumentIds()],
  ];

  for (const [name, call] of cases) {
    it(`${name} refuses when there is no session`, async () => {
      const result = (await call()) as { success?: boolean; error?: string };

      // Asserting only `success: false` would pass today, because these blow
      // up on the mocked db anyway. Pin the reason.
      expect(result?.success).toBe(false);
      expect(result?.error ?? '').toMatch(/authentication required/i);
      expect(dbInsert).not.toHaveBeenCalled();
    });
  }

  it('none of them still takes a user id', () => {
    // A `userId` first parameter is the whole vulnerability: it lets the
    // caller name whose library to act on.
    expect(lib.createDoc.length).toBeLessThanOrEqual(2);
    expect(lib.deleteDoc.length).toBeLessThanOrEqual(2);
    expect(lib.reindexDocument.length).toBeLessThanOrEqual(2);
    expect(lib.manualRepairDocumentRagIds.length).toBeLessThanOrEqual(1);
  });

  it('trackDocumentView goes through profile ownership', async () => {
    const result = await lib.trackDocumentView(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    );

    expect(result.success).toBe(false);
  });
});
