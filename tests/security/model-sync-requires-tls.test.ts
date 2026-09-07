import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ url: 'https://service.example', fetch: vi.fn(), sign: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => ({ user: { id: 'admin' } }) }));
vi.mock('@/lib/oauth/ssrf-protection', () => ({ safeFetch: m.fetch }));
vi.mock('jose', () => ({ SignJWT: class { setProtectedHeader() { return this; } setIssuedAt() { return this; } setExpirationTime() { return this; } setIssuer() { return this; } sign = m.sign; } }));
vi.mock('@/db', async () => {
 const { aiModelsTable } = await import('@/db/schema');
 return { db: { query: { users: { findFirst: async () => ({ is_admin: true }) } },
  select: () => ({ from: (table: unknown) => ({ where: () => table === aiModelsTable ? { orderBy: async () => [{ model_id: 'model' }] } : Promise.resolve([{ uuid: 'service', name: 'service', url: m.url }]) }) }),
  update: () => ({ set: () => ({ where: async () => undefined }) }),
 } };
});
import { POST } from '@/app/api/model-router/sync/route';
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('MODEL_ROUTER_JWT_SECRET', 'test-secret'); m.sign.mockResolvedValue('ADMIN-TOKEN'); m.fetch.mockResolvedValue(new Response('{}')); });
it('refuses an HTTP service before issuing or transmitting an administrative credential', async () => {
 m.url = 'http://service.example';
 const response = await POST(new Request('https://plugged.in/api/model-router/sync', { method: 'POST' }));
 expect(await response!.json()).toMatchObject({ success: false, failed_services: [{ name: 'service', error: expect.stringMatching(/HTTPS/) }] });
 expect(m.sign).not.toHaveBeenCalled(); expect(m.fetch).not.toHaveBeenCalled();
});
it('preserves authenticated HTTPS synchronization', async () => {
 m.url = 'https://service.example';
 const response = await POST(new Request('https://plugged.in/api/model-router/sync', { method: 'POST' }));
 expect(await response!.json()).toMatchObject({ success: true });
 expect(m.fetch).toHaveBeenCalledWith('https://service.example/admin/sync', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer ADMIN-TOKEN' }) }));
});
