import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {}, getAuthSession: vi.fn() }));
vi.mock('@/lib/library/queries', () => ({
  getDocsFor: vi.fn(async () => ({ success: true, docs: [] })),
  getDocByUuidFor: vi.fn(async () => null),
  getDocumentVersionsFor: vi.fn(async () => ({ success: true, versions: [] })),
  getProjectStorageUsageFor: vi.fn(async () => ({ success: true, fileStorage: 0 })),
  WORKSPACE_STORAGE_LIMIT: 100 * 1024 * 1024,
}));

const { getServerSession } = vi.mocked(await import('next-auth'));
const queries = vi.mocked(await import('@/lib/library/queries'));
const { getDocs, getDocByUuid, getDocumentVersions, getProjectStorageUsage } = await import(
  '@/app/actions/library'
);

const VICTIM = 'victim-user-id';
const CALLER = 'caller-user-id';

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: CALLER } } as any);
});

/**
 * getDocs(userId) -> getDocumentVersions(userId, docId) was a complete
 * enumerate-then-read chain: supply a victim's userId and get their document
 * list, then their version rows including content_diff — the document text.
 * The browser was literally passing `doc.user_id` from client state.
 */
describe('library actions derive identity from the session', () => {
  it('takes no caller-supplied user id at all', () => {
    // If these still accepted a userId, an attacker would just pass one.
    expect(getDocs.length).toBeLessThanOrEqual(1);
    expect(getDocumentVersions.length).toBeLessThanOrEqual(2);
  });

  it('queries with the session user, never an argument', async () => {
    await getDocs(undefined as any);

    expect(queries.getDocsFor).toHaveBeenCalledWith(CALLER, undefined);
    expect(queries.getDocsFor).not.toHaveBeenCalledWith(VICTIM, expect.anything());
  });

  it('refuses every action when there is no session', async () => {
    getServerSession.mockResolvedValue(null as any);

    const docs = await getDocs();
    const versions = await getDocumentVersions('doc-uuid');

    expect(docs.success).toBe(false);
    expect(versions.success).toBe(false);
    expect(queries.getDocsFor).not.toHaveBeenCalled();
    expect(queries.getDocumentVersionsFor).not.toHaveBeenCalled();
  });

  it('passes the session user to the document lookup', async () => {
    await getDocByUuid('doc-uuid', 'project-uuid');

    expect(queries.getDocByUuidFor).toHaveBeenCalledWith(CALLER, 'doc-uuid', 'project-uuid');
  });

  it('passes the session user to the version lookup', async () => {
    await getDocumentVersions('doc-uuid', 'project-uuid');

    expect(queries.getDocumentVersionsFor).toHaveBeenCalledWith(CALLER, 'doc-uuid', 'project-uuid');
  });

  it('passes the session user to the storage lookup', async () => {
    await getProjectStorageUsage('project-uuid');

    expect(queries.getProjectStorageUsageFor).toHaveBeenCalledWith(CALLER, 'project-uuid');
    expect(queries.getProjectStorageUsageFor).not.toHaveBeenCalledWith(
      VICTIM,
      expect.anything()
    );
  });

  it('refuses the storage lookup when there is no session', async () => {
    getServerSession.mockResolvedValue(null as any);

    const usage = await getProjectStorageUsage('project-uuid');

    expect(usage.success).toBe(false);
    expect(queries.getProjectStorageUsageFor).not.toHaveBeenCalled();
  });
});
