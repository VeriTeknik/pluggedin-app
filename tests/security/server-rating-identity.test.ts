import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ user: null as string | null, submit: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => m.user ? { user: { id: m.user } } : null }));
vi.mock('next/headers', () => ({ cookies: async () => ({ delete: vi.fn() }) }));
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('NEXT_REDIRECT'); } }));
vi.mock('@/lib/registry/pluggedin-registry-vp-client', () => ({ registryVPClient: { submitRating: m.submit } }));
vi.mock('@/db', () => ({ db: {
 query: { users: { findFirst: async () => ({ id: m.user }) }, profilesTable: { findFirst: async () => ({ project: { user_id: 'owner' } }) } },
 select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [{ profile: { uuid: 'profile' }, project: { user_id: 'owner' } }] }) }) }) }),
} }));
import { rateServer } from '@/app/actions/mcp-server-metrics';
import { McpServerSource } from '@/db/schema';
beforeEach(() => { vi.clearAllMocks(); m.submit.mockResolvedValue({ success: true }); });
it.each([null, 'attacker', 'owner'])('authorizes the rating identity for %s', async (user) => {
 m.user = user;
 expect((await rateServer('profile', 5, 'test', undefined, 'server', McpServerSource.REGISTRY)).success).toBe(user === 'owner');
 if (user === 'owner') expect(m.submit).toHaveBeenCalledWith('server', 5, McpServerSource.REGISTRY, 'owner', 'test', undefined);
 else expect(m.submit).not.toHaveBeenCalled();
});
