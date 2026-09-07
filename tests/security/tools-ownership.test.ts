import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ user: null as string | null, tools: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => state.user ? { user: { id: state.user } } : null }));
vi.mock('next/headers', () => ({ cookies: async () => ({ delete: vi.fn() }) }));
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('NEXT_REDIRECT'); } }));
vi.mock('@/db', () => ({ db: {
 query: { users: { findFirst: async () => ({ id: state.user }) }, toolsTable: { findMany: state.tools } },
 select: () => ({ from: () => ({ innerJoin: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [{ server: { uuid: 'server' }, project: { user_id: 'owner' } }] }) }) }) }) }),
} }));
import { getToolsForServer } from '@/app/actions/tools';
beforeEach(() => { vi.clearAllMocks(); state.tools.mockResolvedValue([{ name: 'private-tool' }]); });
it.each([null, 'attacker', 'owner'])('authorizes tool schemas for %s', async (user) => {
 state.user = user;
 const result = await getToolsForServer('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 if (user === 'owner') { expect(result).toEqual([{ name: 'private-tool' }]); expect(state.tools).toHaveBeenCalledOnce(); }
 else { expect(result).toEqual([]); expect(state.tools).not.toHaveBeenCalled(); }
});
