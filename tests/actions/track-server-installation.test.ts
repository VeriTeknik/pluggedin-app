import { beforeEach, describe, expect, it, vi } from 'vitest';

const findFirst = vi.fn(async () => undefined);
const values = vi.fn(async () => undefined);

vi.mock('@/db', () => ({
  db: {
    query: { serverInstallationsTable: { findFirst }, sharedMcpServersTable: { findFirst } },
    insert: vi.fn(() => ({ values })),
  },
}));

const { trackServerInstallation } = await import('@/app/actions/mcp-server-metrics');
const { McpServerSource } = await import('@/db/schema');

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue(undefined);
});

/**
 * Community servers created by the wizard carry a GitHub-style external id
 * ("io.github.owner/repo"), not a uuid. The notification block bailed out with
 * a bare `return`, which exits the whole action — so a successful installation
 * answered `undefined` instead of the documented `{ success: true }`.
 */
describe('trackServerInstallation always answers its contract', () => {
  it('reports success for a community server with a non-uuid external id', async () => {
    const result = await trackServerInstallation({
      serverUuid: '',
      externalId: 'io.github.owner/repo',
      source: McpServerSource.COMMUNITY,
      profileUuid: 'profile-1',
    });

    expect(result).toEqual({ success: true });
  });
});
