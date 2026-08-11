import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Task tools, and the second scoping axis they introduced.
 *
 * Documents hang off a project; notifications hang off a *profile*. So the Hub
 * check alone is not enough here — a profile has to be reached through a
 * granted Hub, never looked up on its own. The pre-existing app code shows why
 * that matters: clipboard's helper resolves a profile by taking the user's
 * first project with `LIMIT 1` and no ordering, which ignores the granted set
 * entirely. Reaching a profile any other way reintroduces exactly that.
 */

const { mockDb, actions } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn() },
  actions: {
    getNotifications: vi.fn(),
    toggleNotificationCompleted: vi.fn(),
    markNotificationAsRead: vi.fn(),
    deleteNotification: vi.fn(),
  },
}));

vi.mock('@/db', () => ({ db: mockDb }));
vi.mock('@/app/actions/notifications', () => actions);

process.env.NEXTAUTH_SECRET = 'connector-tasks-test-secret';
process.env.NEXTAUTH_URL = 'https://plugged.in';

import { db } from '@/db';
import { dispatchAuthenticated } from '@/lib/mcp/connector/dispatch';
import { findTool } from '@/lib/mcp/connector/tools';
import type { ConnectorIdentity } from '@/lib/oauth/provider/authenticate';

const HUB_A = '11111111-1111-1111-1111-111111111111';
const PROFILE_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TOKEN = '33333333-3333-3333-3333-333333333333';

function identity(overrides: Partial<ConnectorIdentity> = {}): ConnectorIdentity {
  return {
    userId: 'user-1',
    grantedProjectUuids: [HUB_A],
    defaultProjectUuid: HUB_A,
    scopes: ['tasks:read', 'tasks:write'],
    tokenUuid: TOKEN,
    ...overrides,
  };
}

/**
 * requireHubProfile makes two queries: the granted Hubs, then that Hub's
 * profiles. Answering them in order is what lets these tests assert the second
 * was scoped to the first.
 */
function hubThenProfile(
  hubs: { uuid: string; name: string }[],
  profiles: { uuid: string }[]
) {
  const profileWhere = vi.fn(() => ({
    orderBy: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(profiles) })),
  }));
  let call = 0;
  (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    from: vi.fn(() => {
      call += 1;
      return call === 1 ? { where: vi.fn().mockResolvedValue(hubs) } : { where: profileWhere };
    }),
  }));
  return { profileWhere };
}

function call(name: string, args: Record<string, unknown> = {}) {
  return { jsonrpc: '2.0' as const, id: 1, method: 'tools/call', params: { name, arguments: args } };
}

function payloadOf(outcome: Awaited<ReturnType<typeof dispatchAuthenticated>>) {
  if (outcome.kind !== 'result') throw new Error('expected a result');
  const result = outcome.result as { isError?: boolean; content: { text: string }[] };
  return { isError: result.isError, text: result.content[0].text };
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.getNotifications.mockResolvedValue({ success: true, notifications: [] });
  actions.toggleNotificationCompleted.mockResolvedValue({ success: true });
  actions.markNotificationAsRead.mockResolvedValue({ success: true });
  actions.deleteNotification.mockResolvedValue({ success: true });
});

describe('the profile is reached through the Hub', () => {
  it('passes the Hub profile to getNotifications', async () => {
    hubThenProfile([{ uuid: HUB_A, name: 'Acme' }], [{ uuid: PROFILE_A }]);

    await dispatchAuthenticated(call('pluggedin_list_notifications'), identity());

    expect(actions.getNotifications).toHaveBeenCalledWith(PROFILE_A, false);
  });

  it('scopes the profile query to the resolved Hub', async () => {
    // Without this the profile could come from any project the user owns,
    // which is what the existing clipboard helper does.
    const { profileWhere } = hubThenProfile([{ uuid: HUB_A, name: 'Acme' }], [{ uuid: PROFILE_A }]);

    await dispatchAuthenticated(call('pluggedin_list_notifications'), identity());

    expect(profileWhere).toHaveBeenCalledOnce();
  });

  it('never reaches an action when the Hub cannot be resolved', async () => {
    hubThenProfile([], []);

    const result = payloadOf(
      await dispatchAuthenticated(
        call('pluggedin_list_notifications'),
        identity({ grantedProjectUuids: [], defaultProjectUuid: null })
      )
    );

    expect(result.isError).toBe(true);
    expect(actions.getNotifications).not.toHaveBeenCalled();
  });

  it('says which Hub is empty when it holds no profile', async () => {
    hubThenProfile([{ uuid: HUB_A, name: 'Acme' }], []);

    const result = payloadOf(
      await dispatchAuthenticated(call('pluggedin_list_notifications'), identity())
    );

    expect(result.isError).toBe(true);
    expect(result.text).toContain('Acme');
    expect(actions.getNotifications).not.toHaveBeenCalled();
  });
});

describe('writes carry the profile too', () => {
  it('completes a task against the Hub profile, not by id alone', async () => {
    hubThenProfile([{ uuid: HUB_A, name: 'Acme' }], [{ uuid: PROFILE_A }]);

    await dispatchAuthenticated(
      call('pluggedin_mark_notification_done', { id: 'task-1' }),
      identity()
    );

    // The action filters on the profile, so a task in another Hub cannot be
    // reached by guessing its id.
    expect(actions.toggleNotificationCompleted).toHaveBeenCalledWith('task-1', PROFILE_A);
  });

  it('deletes against the Hub profile', async () => {
    hubThenProfile([{ uuid: HUB_A, name: 'Acme' }], [{ uuid: PROFILE_A }]);

    await dispatchAuthenticated(call('pluggedin_delete_notification', { id: 'task-1' }), identity());

    expect(actions.deleteNotification).toHaveBeenCalledWith('task-1', PROFILE_A);
  });

  it('refuses a write when the token holds only tasks:read', async () => {
    hubThenProfile([{ uuid: HUB_A, name: 'Acme' }], [{ uuid: PROFILE_A }]);

    const result = payloadOf(
      await dispatchAuthenticated(
        call('pluggedin_delete_notification', { id: 'task-1' }),
        identity({ scopes: ['tasks:read'] })
      )
    );

    expect(result.isError).toBe(true);
    expect(actions.deleteNotification).not.toHaveBeenCalled();
  });
});

describe('annotations', () => {
  it('marks deletion destructive and listing read-only', () => {
    // Anthropic's directory rules require these, and a model treats a
    // destructive tool differently. Getting it wrong is caught at submission,
    // long after it would have mattered.
    expect(findTool('pluggedin_delete_notification')?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
    expect(findTool('pluggedin_list_notifications')?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
    expect(findTool('pluggedin_mark_notification_done')?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
  });
});
