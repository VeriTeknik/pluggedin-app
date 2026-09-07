import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({ admin: false, reads: vi.fn(), chat: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => ({ user: { id: 'user' } }) }));
vi.mock('@/app/api/auth', () => ({ authenticate: async () => ({ user: { id: 'user' } }) }));
vi.mock('@/lib/model-router', () => ({ getProviderForModel: () => 'provider', resolveModelAlias: (m: string) => m, routeChatCompletion: s.chat }));
vi.mock('@/db', () => ({ db: {
 query: { users: { findFirst: async () => ({ is_admin: s.admin }) }, clustersTable: { findFirst: s.reads } },
 select: () => ({ from: () => ({ orderBy: s.reads, where: () => ({ orderBy: s.reads }) }) }),
} }));
const modules: Record<string, () => Promise<any>> = {
 'clusters': () => import('@/app/api/clusters/route'),
 'clusters/[clusterId]/agents': () => import('@/app/api/clusters/[clusterId]/agents/route'),
 'clusters/[clusterId]/agents/[agentId]': () => import('@/app/api/clusters/[clusterId]/agents/[agentId]/route'),
 'clusters/[clusterId]/alerts': () => import('@/app/api/clusters/[clusterId]/alerts/route'),
 'model-router/sync': () => import('@/app/api/model-router/sync/route'),
 'model-router/chat/completions': () => import('@/app/api/model-router/chat/completions/route'),
};
const routes = [
 ['clusters', 'GET'], ['clusters', 'POST'], ['clusters/[clusterId]/agents', 'GET'],
 ['clusters/[clusterId]/agents/[agentId]', 'GET'], ['clusters/[clusterId]/alerts', 'GET'],
 ['model-router/sync', 'POST'], ['model-router/chat/completions', 'POST'],
] as const;
beforeEach(() => { vi.clearAllMocks(); s.admin = false; s.reads.mockResolvedValue([]); s.chat.mockResolvedValue({ choices: [] }); });
for (const [route, method] of routes) {
 it(`rejects non-admin ${method} ${route} before processing input`, async () => {
  const handler = await modules[route]();
  const request = new NextRequest(`https://plugged.in/api/${route}`, { method, ...(method === 'POST' ? { body: JSON.stringify({ model: 'test', messages: [{ role: 'user', content: 'hello' }] }) } : {}) });
  const response = await handler[method](request, { params: Promise.resolve({ clusterId: 'cluster', agentId: 'agent' }) });
  expect(response.status).toBe(403);
  expect(s.reads).not.toHaveBeenCalled();
  expect(s.chat).not.toHaveBeenCalled();
 });
}
it('allows a database admin to list clusters', async () => {
 s.admin = true;
 const { GET } = await import('@/app/api/clusters/route');
 expect((await GET(new Request('https://plugged.in/api/clusters')))?.status).toBe(200);
 expect(s.reads).toHaveBeenCalledOnce();
});
