import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthSession = vi.fn(async () => null as unknown);
const usersFindFirst = vi.fn(async () => ({ id: 'caller' }));
const profileSelect = vi.fn();
const queryForContext = vi.fn(async () => ({ success: true, context: 'secret context' }));
const projectFindFirst = vi.fn();

vi.mock('@/lib/auth', () => ({ getAuthSession }));
vi.mock('@/lib/rag-service', () => ({ ragService: { queryForContext } }));
vi.mock('next/headers', () => ({ cookies: async () => ({ delete: () => {} }) }));
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('NEXT_REDIRECT');
  },
}));
vi.mock('@/db', () => ({
  db: {
    query: {
      users: { findFirst: usersFindFirst },
      projectsTable: { findFirst: projectFindFirst },
    },
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({ where: () => ({ limit: profileSelect }) }),
          where: () => ({ limit: profileSelect }),
        }),
        where: () => ({ limit: profileSelect }),
      }),
    }),
  },
}));

const OWNER = 'owner-user-id';
const CALLER = 'caller-user-id';
const PROFILE = 'profile-uuid';

beforeEach(() => {
  vi.clearAllMocks();
  getAuthSession.mockResolvedValue({ user: { id: CALLER } });
  usersFindFirst.mockResolvedValue({ id: CALLER });
  // The profile belongs to OWNER, not to the caller.
  profileSelect.mockResolvedValue([
    { profile: { uuid: PROFILE, project_uuid: 'p1' }, project: { uuid: 'p1', user_id: OWNER } },
  ]);
});

/**
 * app/actions/mcp-playground.ts had ten exported actions and not one auth
 * helper anywhere in the file. Nine took a profileUuid straight from the
 * caller, so a signed-in user could read another tenant's live conversation,
 * drive their agent, read their server logs, or end their session.
 */
describe('the playground refuses a profile the caller does not own', () => {
  const cases: Array<[string, (m: any) => Promise<unknown>]> = [
    ['getPlaygroundSessionStatus', (m) => m.getPlaygroundSessionStatus(PROFILE)],
    ['getServerLogs', (m) => m.getServerLogs(PROFILE)],
    ['clearServerLogs', (m) => m.clearServerLogs(PROFILE)],
    ['endPlaygroundSession', (m) => m.endPlaygroundSession(PROFILE)],
    ['restorePlaygroundSession', (m) => m.restorePlaygroundSession(PROFILE)],
    ['executePlaygroundQuery', (m) => m.executePlaygroundQuery(PROFILE, 'steal')],
  ];

  for (const [name, call] of cases) {
    it(`${name} refuses a foreign profile`, async () => {
      const m = await import('@/app/actions/mcp-playground');

      const result = (await call(m)) as { success?: boolean; error?: string };

      expect(result?.success).toBe(false);
      expect(result?.error ?? '').toMatch(/unauthorized|not found/i);
    });
  }

  it('allows the owner through', async () => {
    getAuthSession.mockResolvedValue({ user: { id: OWNER } });
    usersFindFirst.mockResolvedValue({ id: OWNER });
    const m = await import('@/app/actions/mcp-playground');

    const result = await m.getPlaygroundSessionStatus(PROFILE);

    expect(result.success).toBe(true);
  });
});

/**
 * queryRag took a ragIdentifier — a project uuid — with no session and no
 * ownership check, and handed back retrieved context from it. It has no caller
 * anywhere in the repo; it was pure exposure.
 */
describe('queryRag is scoped to a project the caller owns', () => {
  it('refuses an unowned project', async () => {
    projectFindFirst.mockResolvedValue(undefined);
    const m = await import('@/app/actions/mcp-playground');

    const result = await m.queryRag('what do they have', 'someone-elses-project');

    expect(result.success).toBe(false);
    expect(queryForContext).not.toHaveBeenCalled();
  });

  it('refuses an anonymous caller', async () => {
    getAuthSession.mockResolvedValue(null);
    const m = await import('@/app/actions/mcp-playground');

    const result = await m.queryRag('anything', 'any-project');

    expect(result.success).toBe(false);
    expect(queryForContext).not.toHaveBeenCalled();
  });

  it('queries a project the caller owns', async () => {
    projectFindFirst.mockResolvedValue({ uuid: 'mine', user_id: CALLER });
    const m = await import('@/app/actions/mcp-playground');

    await m.queryRag('what do I have', 'mine');

    expect(queryForContext).toHaveBeenCalledWith('what do I have', 'mine');
  });
});

/**
 * withOwnedProfile turns withProfileAuth's throw into the { success, error }
 * shape these actions promise. Converting *every* exception would report a
 * database outage as an authorization refusal — a wrong answer that looks
 * like a considered one.
 */
describe('withOwnedProfile only converts an authorization refusal', () => {
  it('lets an unexpected failure surface instead of calling it unauthorized', async () => {
    profileSelect.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const m = await import('@/app/actions/mcp-playground');

    await expect(m.getServerLogs(PROFILE)).rejects.toThrow(/connection terminated/);
  });
});

/**
 * The client finds the in-flight streaming message inside `result.logs`, but
 * the partial is stored under a separate key, so it was never in that list and
 * hasPartialMessage was always false. Pre-existing; surfaced by moving the
 * store.
 */
describe('getServerLogs surfaces the in-flight streaming message', () => {
  it('includes the partial entry and flags it', async () => {
    getAuthSession.mockResolvedValue({ user: { id: OWNER } });
    usersFindFirst.mockResolvedValue({ id: OWNER });
    const { setPartialServerLog } = await import('@/lib/mcp/server-logs');
    setPartialServerLog(PROFILE, {
      level: 'streaming',
      message: JSON.stringify({ isPartial: true, content: 'half a th' }),
      timestamp: new Date(0),
    });

    const m = await import('@/app/actions/mcp-playground');
    const result = (await m.getServerLogs(PROFILE)) as {
      logs: Array<{ level: string }>;
      hasPartialMessage: boolean;
    };

    expect(result.hasPartialMessage).toBe(true);
    expect(result.logs.some((l) => l.level === 'streaming')).toBe(true);
  });
});
