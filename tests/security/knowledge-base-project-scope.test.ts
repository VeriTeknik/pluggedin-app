import { beforeEach, describe, expect, it, vi } from 'vitest';

const findFirst = vi.fn();
const queryForResponse = vi.fn(async () => ({ success: true, response: 'answer', documentIds: [] }));

vi.mock('@/db', () => ({
  db: {
    query: { projectsTable: { findFirst }, docsTable: { findMany: vi.fn(async () => []) } },
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(async () => []) })) })),
  },
}));
vi.mock('@/lib/rag-service', () => ({ ragService: { queryForResponse, getStorageStats: vi.fn() } }));
vi.mock('@/lib/sanitization', () => ({ sanitizeToPlainText: (s: string) => s }));

const { askKnowledgeBaseFor } = await import('@/lib/library/queries');

const OWNER = 'owner-user-id';
const OTHER = 'other-user-id';
const PROJECT = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  queryForResponse.mockResolvedValue({ success: true, response: 'answer', documentIds: [] });
});

/**
 * The RAG query is scoped by `projectUuid || userId` and nothing else, so a
 * caller naming another tenant's project got an answer composed from that
 * tenant's documents. Same defect as getProjectStorageUsageFor, in the same
 * file — which is why the ownership check now lives in one shared helper.
 */
describe('askKnowledgeBaseFor scopes the project to the caller', () => {
  it('refuses a project the caller does not own', async () => {
    findFirst.mockResolvedValue(undefined);

    const result = await askKnowledgeBaseFor(OTHER, 'what do they have', PROJECT);

    expect(result.success).toBe(false);
    expect(queryForResponse).not.toHaveBeenCalled();
  });

  it('queries a project the caller owns', async () => {
    findFirst.mockResolvedValue({ uuid: PROJECT, user_id: OWNER });

    const result = await askKnowledgeBaseFor(OWNER, 'what do I have', PROJECT);

    expect(result.success).toBe(true);
    expect(queryForResponse).toHaveBeenCalledWith(PROJECT, 'what do I have');
  });

  it('falls back to the user scope when no project is named', async () => {
    await askKnowledgeBaseFor(OWNER, 'anything');

    expect(findFirst).not.toHaveBeenCalled();
    expect(queryForResponse).toHaveBeenCalledWith(OWNER, 'anything');
  });
});
