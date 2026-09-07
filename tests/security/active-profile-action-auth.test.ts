import { beforeEach, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({ user: null as string | null, profileRead: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => s.user ? { user: { id: s.user } } : null }));
vi.mock('next/headers', () => ({ cookies: async () => ({ delete: vi.fn() }) }));
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('NEXT_REDIRECT'); } }));
vi.mock('@/db', () => ({ db: {
 query: { users: { findFirst: async () => ({ id: s.user }) } },
 select: () => ({ from: () => ({
  where: () => ({ limit: async () => [{ uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', user_id: 'owner', active_profile_uuid: 'profile' }] }),
  innerJoin: () => ({ innerJoin: () => ({ where: () => ({ limit: s.profileRead }) }) }),
 }) }),
} }));
import { getProjectActiveProfile } from '@/app/actions/profiles';
beforeEach(() => { vi.clearAllMocks(); s.profileRead.mockResolvedValue([{ uuid: 'profile', userEmail: 'owner@example.com' }]); });
it.each([null, 'attacker', 'owner'])('authorizes active profile lookup for %s', async (user) => {
 s.user = user;
 const run = () => getProjectActiveProfile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 if (user === 'owner') { expect(await run()).toMatchObject({ uuid: 'profile' }); expect(s.profileRead).toHaveBeenCalledOnce(); }
 else { await expect(run()).rejects.toThrow(); expect(s.profileRead).not.toHaveBeenCalled(); }
});
