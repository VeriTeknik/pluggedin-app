import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The MCP OAuth proxy callback forwards to a stored loopback URL (deepsec
 * pluggedin-app-ssrf-58e47f119d, revalidated as "uncertain").
 *
 * The sink is real: for any valid state it sent a server-side GET to whatever
 * loopback URL was stored — any path, any port from 1024 up, with every query
 * parameter the caller supplied appended. That URL is copied out of an
 * intercepted authorization request (StreamableHTTPWrapper), not allocated by
 * the app, so it is an internal-service request primitive on the production
 * host. What the revalidation could not establish is how an attacker obtains a
 * state; nothing checked that the state belonged to the signed-in user either.
 *
 * The forward is narrowed to what it exists for — an mcp-remote style listener
 * at http://<loopback>:<port>/oauth/callback — for the owner of the flow only,
 * carrying only the OAuth response parameters.
 */

const m = vi.hoisted(() => ({
  session: vi.fn(),
  getOAuthSession: vi.fn(),
  deleteOAuthSession: vi.fn(),
  owns: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getAuthSession: m.session }));
vi.mock('@/lib/mcp/oauth/OAuthStateManager', () => ({
  oauthStateManager: { getOAuthSession: m.getOAuthSession, deleteOAuthSession: m.deleteOAuthSession },
}));
vi.mock('@/lib/rate-limiter', () => ({
  RateLimiters: { registryOAuth: async () => ({ allowed: true, limit: 10, remaining: 9, reset: Date.now() }) },
}));
vi.mock('@/lib/auth/profile-ownership', () => ({ userOwnsProfile: m.owns }));

import { GET } from '@/app/api/mcp/oauth/callback/route';

function storedFlow(callback_url: string) {
  return {
    id: 1,
    state: 'STATE',
    server_uuid: 'server-1',
    profile_uuid: 'profile-of-user-1',
    callback_url,
    provider: 'Example',
    created_at: new Date(),
    expires_at: new Date(Date.now() + 60_000),
  };
}

function callback(query: string) {
  return new NextRequest(`https://plugged.in/api/mcp/oauth/callback?${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', m.fetch);
  m.session.mockResolvedValue({ user: { id: 'user-1' } });
  m.owns.mockImplementation(async (userId: string, profileUuid: string) =>
    userId === 'user-1' && profileUuid === 'profile-of-user-1'
  );
  m.fetch.mockResolvedValue(new Response('ok', { status: 200 }));
});

describe('the forward only reaches the OAuth callback listener', () => {
  it.each([
    ['an arbitrary local admin path', 'http://127.0.0.1:8080/admin/shutdown?confirm=yes'],
    ['the app itself', 'http://localhost:12005/api/admin/users'],
    ['the root of a local service', 'http://[::1]:9200/'],
    ['https to loopback', 'https://localhost:14881/oauth/callback'],
    ['a callback path with a query of its own', 'http://localhost:14881/oauth/callback?next=/admin'],
  ])('does not fetch %s', async (_label, stored) => {
    m.getOAuthSession.mockResolvedValue(storedFlow(stored));

    const response = await GET(callback('state=STATE&code=abc'));

    expect(m.fetch).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });

  it('forwards only the OAuth response parameters to the listener', async () => {
    m.getOAuthSession.mockResolvedValue(storedFlow('http://localhost:14881/oauth/callback'));

    await GET(callback('state=STATE&code=abc&iss=https%3A%2F%2Fidp.example&cmd=FLUSHALL&next=%2Fadmin'));

    expect(m.fetch).toHaveBeenCalledTimes(1);
    const [target, init] = m.fetch.mock.calls[0];
    const url = new URL(String(target));
    expect(`${url.origin}${url.pathname}`).toBe('http://localhost:14881/oauth/callback');
    expect([...url.searchParams.keys()].sort()).toEqual(['code', 'iss', 'state']);
    expect(url.searchParams.get('code')).toBe('abc');
    expect(init).toMatchObject({ method: 'GET', redirect: 'manual' });
  });
});

describe('the flow belongs to the user who started it', () => {
  it('refuses a state issued for another user\'s profile', async () => {
    m.getOAuthSession.mockResolvedValue(storedFlow('http://localhost:14881/oauth/callback'));
    m.session.mockResolvedValue({ user: { id: 'someone-else' } });

    const response = await GET(callback('state=STATE&code=abc'));

    expect(m.fetch).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    // Not consumed: someone else presenting the state must not be able to
    // cancel the owner's flow either.
    expect(m.deleteOAuthSession).not.toHaveBeenCalled();
  });
});
