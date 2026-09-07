import { beforeEach, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({ user: null as string | null, read: vi.fn(), write: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => s.user ? { user: { id: s.user } } : null }));
vi.mock('next/headers', () => ({ cookies: async () => ({ delete: vi.fn() }) }));
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('NEXT_REDIRECT'); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/db', async () => {
 const { profilesTable } = await import('@/db/schema');
 return { db: {
  query: { users: { findFirst: async () => ({ id: s.user }) } },
  select: () => ({ from: (table: unknown) => table === profilesTable
    ? { innerJoin: () => ({ where: () => ({ limit: async () => [{ profile: { uuid: 'victim' }, project: { user_id: 'owner' } }] }) }) }
    : { where: () => ({ limit: s.read, orderBy: s.read }) } }),
  insert: () => ({ values: s.write }), update: () => ({ set: () => ({ where: s.write }) }), delete: () => ({ where: s.write }),
 } };
});
import * as actions from '@/app/actions/notifications';
const calls = {
 createNotification: () => actions.createNotification({ profileUuid: 'victim', title: 'hello', message: 'hello', type: 'INFO' }),
 getNotifications: () => actions.getNotifications('victim'),
 markNotificationAsRead: () => actions.markNotificationAsRead('id', 'victim'),
 markAllNotificationsAsRead: () => actions.markAllNotificationsAsRead('victim'),
 deleteNotification: () => actions.deleteNotification('id', 'victim'),
 deleteAllNotifications: () => actions.deleteAllNotifications('victim'),
 toggleNotificationCompleted: () => actions.toggleNotificationCompleted('id', 'victim'),
};
beforeEach(() => { vi.clearAllMocks(); s.read.mockResolvedValue([{ id: 'id', metadata: {} }]); s.write.mockResolvedValue(undefined); });
for (const [name, call] of Object.entries(calls)) {
 it.each([null, 'attacker', 'owner'])(`${name} checks ownership for %s`, async (user) => {
  s.user = user;
  const result = await call();
  expect(result.success).toBe(user === 'owner');
  if (user !== 'owner') { expect(s.read).not.toHaveBeenCalled(); expect(s.write).not.toHaveBeenCalled(); }
  else expect(s.read.mock.calls.length + s.write.mock.calls.length).toBeGreaterThan(0);
 });
}
it('covers every public notification action and does not expose the API-only helper', () => {
 expect(Object.keys(actions).sort()).toEqual(Object.keys(calls).sort());
});
