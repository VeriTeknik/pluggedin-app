/**
 * The model-service sync routes reach the stored service URL through safeFetch
 * (resolved, private addresses refused, the address pinned, every redirect
 * re-validated). The connection tests did not: POST .../[serviceId]/test used a
 * bare fetch after a text-only URL check — a name that resolves to a private
 * address, or a redirect to one, went straight through — and POST
 * /api/admin/model-services tested the URL from the request body with a bare
 * fetch and no check at all.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  rawFetch: vi.fn(),
  service: {} as Record<string, unknown>,
  insertValues: vi.fn(),
}));

vi.mock('@/lib/oauth/ssrf-protection', () => ({ safeFetch: m.safeFetch }));
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => ({ user: { id: 'admin', email: 'a@example.com' } }) }));
vi.mock('@/db', () => {
  const chain: any = {};
  for (const method of ['select', 'from', 'where', 'orderBy', 'leftJoin', 'innerJoin']) {
    chain[method] = () => chain;
  }
  chain.limit = async () => [m.service];
  return {
    db: {
      query: { users: { findFirst: async () => ({ id: 'admin', is_admin: true }) } },
      select: () => chain,
      update: () => ({ set: () => ({ where: async () => undefined }) }),
      insert: () => ({
        values: (values: unknown) => {
          m.insertValues(values);
          return { returning: async () => [{ uuid: 'new-service', ...(values as object) }] };
        },
      }),
    },
  };
});

const { POST: testService } = await import('@/app/api/admin/model-services/[serviceId]/test/route');
const { POST: createService } = await import('@/app/api/admin/model-services/route');

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', m.rawFetch);
  m.rawFetch.mockResolvedValue(json({ status: 'ok' }));
  m.safeFetch.mockImplementation(async (url: string) =>
    url.endsWith('/v1/models') ? json({ models: [{ id: 'gpt-4o' }] }) : json({ status: 'ok' })
  );
  m.service = {
    uuid: 'svc',
    url: 'https://router.example.com',
    health_endpoint: '/health',
    models_endpoint: '/v1/models',
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/admin/model-services/[serviceId]/test', () => {
  it('reaches the service only through safeFetch', async () => {
    const res = await testService(new NextRequest('http://localhost/api/admin/model-services/svc/test', { method: 'POST' }), {
      params: Promise.resolve({ serviceId: 'svc' }),
    });

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.models).toEqual(['gpt-4o']);
    expect(m.safeFetch.mock.calls.map(([url]) => url)).toEqual([
      'https://router.example.com/health',
      'https://router.example.com/v1/models',
    ]);
    expect(m.rawFetch).not.toHaveBeenCalled();
  });

  it('reports the refusal as an unhealthy service', async () => {
    m.safeFetch.mockRejectedValue(new Error('Host router.example.com resolves to a private or reserved address'));

    const res = await testService(new NextRequest('http://localhost/api/admin/model-services/svc/test', { method: 'POST' }), {
      params: Promise.resolve({ serviceId: 'svc' }),
    });

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/private/);
    expect(m.rawFetch).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/model-services (connection test on create)', () => {
  const create = (url: string) =>
    createService(
      new NextRequest('http://localhost/api/admin/model-services', {
        method: 'POST',
        body: JSON.stringify({ name: 'router', url, auto_discover_models: false }),
      })
    );

  it('reaches the service only through safeFetch', async () => {
    await create('https://router.example.com');

    expect(m.safeFetch.mock.calls.map(([url]) => url)).toEqual([
      'https://router.example.com/health',
      'https://router.example.com/v1/models',
    ]);
    expect(m.rawFetch).not.toHaveBeenCalled();
  });

  it('refuses a blocked address without contacting it', async () => {
    const res = await create('http://169.254.169.254');

    expect(res.status).toBe(400);
    expect(m.safeFetch).not.toHaveBeenCalled();
    expect(m.rawFetch).not.toHaveBeenCalled();
    expect(m.insertValues).not.toHaveBeenCalled();
  });
});
