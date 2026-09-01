import { beforeEach, describe, expect, it, vi } from 'vitest';

const findFirst = vi.fn();
const getStorageStats = vi.fn(async () => ({ success: true, estimatedStorageMb: 5 }));

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(async () => [{ totalSize: 1024 }]) })),
    })),
    query: { projectsTable: { findFirst } },
  },
}));

vi.mock('@/lib/rag-service', () => ({ ragService: { getStorageStats } }));

const { getProjectStorageUsageFor } = await import('@/lib/library/queries');

const OWNER = 'owner-user-id';
const OTHER = 'other-user-id';
const PROJECT = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  getStorageStats.mockResolvedValue({ success: true, estimatedStorageMb: 5 });
  process.env.ENABLE_RAG = 'true';
});

/**
 * The document totals are scoped by `user_id`, but the RAG branch passed the
 * caller-supplied `projectUuid` straight to ragService.getStorageStats(). That
 * read is scoped by project alone, so naming someone else's project returned
 * their RAG storage figures.
 */
describe('getProjectStorageUsageFor scopes the project to the caller', () => {
  it('refuses a project the caller does not own', async () => {
    findFirst.mockResolvedValue(undefined); // no project owned by OTHER

    const result = await getProjectStorageUsageFor(OTHER, PROJECT);

    expect(result.success).toBe(false);
    expect(getStorageStats).not.toHaveBeenCalled();
  });

  it('reports storage for a project the caller owns', async () => {
    findFirst.mockResolvedValue({ uuid: PROJECT, user_id: OWNER });

    const result = await getProjectStorageUsageFor(OWNER, PROJECT);

    expect(result.success).toBe(true);
    expect(result.fileStorage).toBe(1024);
    expect(getStorageStats).toHaveBeenCalledWith(PROJECT);
  });

  it('needs no project check when no project is named', async () => {
    const result = await getProjectStorageUsageFor(OWNER);

    expect(result.success).toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
    expect(getStorageStats).not.toHaveBeenCalled();
  });
});
