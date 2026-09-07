import { NextRequest } from 'next/server';
import { expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ safe: vi.fn(), raw: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => ({ user: { id: 'admin', email: 'admin@example.com' } }) }));
vi.mock('@/lib/oauth/ssrf-protection', () => ({ safeFetch: m.safe }));
vi.mock('@/db', async () => {
 const { modelRouterServicesTable } = await import('@/db/schema');
 return { db: {
  query: { users: { findFirst: async () => ({ is_admin: true }) } },
  select: () => ({ from: (table: unknown) => ({ where: () => table === modelRouterServicesTable ? { limit: async () => [{ uuid: 'service', name: 'service', url: 'https://rebind.example', sync_endpoint: '/sync' }] } : Promise.resolve([{ model_id: 'model', provider: 'test' }]) }) }),
  update: () => ({ set: () => ({ where: async () => undefined }) }),
 } };
});
import { POST } from '@/app/api/admin/model-services/[serviceId]/sync/route';
it('sends model sync through DNS-pinned SSRF protection', async () => {
 vi.stubGlobal('fetch', m.raw);
 m.raw.mockResolvedValue(new Response(JSON.stringify({ accepted: ['model'], rejected: [] }), { headers: { 'Content-Type': 'application/json' } }));
 m.safe.mockRejectedValue(new Error('Host resolves to a private address'));
 await POST(new NextRequest('https://plugged.in/api/admin/model-services/service/sync', { method: 'POST', body: '{}' }), { params: Promise.resolve({ serviceId: 'service' }) });
 expect(m.safe).toHaveBeenCalledWith('https://rebind.example/sync', expect.objectContaining({ method: 'POST' }));
 expect(m.raw).not.toHaveBeenCalled();
});
