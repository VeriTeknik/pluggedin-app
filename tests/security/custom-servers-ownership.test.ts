import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthSession = vi.fn(async () => null as unknown);
const usersFindFirst = vi.fn(async () => ({ id: 'caller' }));
const profileSelect = vi.fn();
const rows = vi.fn(async () => []);
const update = vi.fn(() => ({ set: () => ({ where: async () => undefined }) }));
const insert = vi.fn(() => ({ values: () => ({ returning: async () => [{ uuid: 'x' }] }) }));

vi.mock('@/lib/auth', () => ({ getAuthSession }));
vi.mock('next/headers', () => ({ cookies: async () => ({ delete: () => {} }) }));
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('NEXT_REDIRECT');
  },
}));
vi.mock('@/db', () => {
  const chain: any = {
    from: () => chain,
    leftJoin: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: rows,
    limit: (n?: number) => (n === 1 ? profileSelect() : rows()),
    then: (resolve: (v: unknown) => void) => rows().then(resolve),
  };
  return {
    db: {
      select: (projection?: unknown) => (projection ? chain : chain),
      update,
      insert,
      delete: () => ({ where: async () => undefined }),
      query: { users: { findFirst: usersFindFirst } },
    },
  };
});

const actions = await import('@/app/actions/custom-mcp-servers');

const PROFILE = '11111111-1111-4111-8111-111111111111';
const OWNER = 'owner-user-id';

beforeEach(() => {
  vi.clearAllMocks();
  getAuthSession.mockResolvedValue({ user: { id: OWNER } });
  usersFindFirst.mockResolvedValue({ id: OWNER });
  rows.mockResolvedValue([]);
  // The profile belongs to somebody else.
  profileSelect.mockResolvedValue([
    {
      profile: { uuid: PROFILE, project_uuid: 'p1' },
      project: { uuid: 'p1', user_id: 'a-different-user' },
    },
  ]);
});

/**
 * app/actions/custom-mcp-servers.ts had six exported actions and no auth helper
 * anywhere in the file. All six take a profileUuid straight from the caller,
 * and the reads join in codesTable.code — the source that runs for the server —
 * alongside the env column the UI invites users to fill with API keys.
 */
describe('custom MCP servers are scoped to the calling profile', () => {
  const cases: Array<[string, () => Promise<unknown>]> = [
    ['getCustomMcpServers', () => actions.getCustomMcpServers(PROFILE)],
    ['getCustomMcpServerByUuid', () => actions.getCustomMcpServerByUuid(PROFILE, 'srv')],
    ['deleteCustomMcpServerByUuid', () => actions.deleteCustomMcpServerByUuid(PROFILE, 'srv')],
    [
      'toggleCustomMcpServerStatus',
      () => actions.toggleCustomMcpServerStatus(PROFILE, 'srv', 'ACTIVE' as never),
    ],
    ['createCustomMcpServer', () => actions.createCustomMcpServer(PROFILE, { name: 'x' } as never)],
    ['updateCustomMcpServer', () => actions.updateCustomMcpServer(PROFILE, 'srv', {} as never)],
  ];

  for (const [name, call] of cases) {
    it(`${name} refuses a profile the caller does not own`, async () => {
      await expect(call()).rejects.toThrow(/unauthorized|not found/i);
    });
  }

  it('lets the owner through', async () => {
    profileSelect.mockResolvedValue([
      { profile: { uuid: PROFILE, project_uuid: 'p1' }, project: { uuid: 'p1', user_id: OWNER } },
    ]);

    await expect(actions.getCustomMcpServers(PROFILE)).resolves.toEqual([]);
  });
});
