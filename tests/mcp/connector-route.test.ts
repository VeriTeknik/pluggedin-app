import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The route handler itself, not the connector function underneath it.
 *
 * This file exists because tests/mcp/connector-endpoint.test.ts calls
 * handleConnectorRequest with an already-parsed body, so it never touches the
 * route's own parse step — and that is exactly where the ordering bug lived:
 * the body was read before the credential branch, so a malformed or absent
 * body threw and an unauthenticated caller got a 500 instead of the challenge.
 * A client whose first probe is empty would never learn where to authenticate.
 *
 * The lesson is the reason for the file: a test that enters below the layer
 * under discussion cannot see a bug in that layer.
 */

const { mockDb } = vi.hoisted(() => ({ mockDb: { select: vi.fn(), update: vi.fn() } }));
vi.mock('@/db', () => ({ db: mockDb }));

process.env.NEXTAUTH_SECRET = 'connector-route-test-secret';
process.env.NEXTAUTH_URL = 'https://plugged.in';

const { sessionValue } = vi.hoisted(() => ({ sessionValue: { current: null as unknown } }));
vi.mock('next-auth/next', () => ({
  getServerSession: () => Promise.resolve(sessionValue.current),
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/mcp/streamable-http/handler', () => ({
  handleStreamableHTTPRequest: vi.fn().mockResolvedValue({ body: { ok: true }, status: 200 }),
}));
vi.mock('@/lib/mcp/sessions/SessionManager', () => ({
  getSessionManager: () => ({ closeSession: vi.fn() }),
}));

import { NextRequest } from 'next/server';

import { db } from '@/db';
import { POST } from '@/app/api/mcp/route';
import { handleStreamableHTTPRequest } from '@/lib/mcp/streamable-http/handler';

/** `body` is passed through verbatim so malformed input can be sent as-is. */
function post(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('https://plugged.in/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionValue.current = null;
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })),
  });
});

describe('unauthenticated', () => {
  it('challenges even when the body is malformed', async () => {
    const response = await POST(post('this is not json'));

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata');
  });

  it('challenges even when there is no body at all', async () => {
    // The realistic first probe: someone runs curl -X POST with no payload.
    // Before the fix this threw in req.json() and produced a 500.
    const response = await POST(
      new NextRequest('https://plugged.in/api/mcp', { method: 'POST' })
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata');
  });

  it('challenges a well-formed request too', async () => {
    const response = await POST(post(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })));
    expect(response.status).toBe(401);
  });
});

describe('bearer path', () => {
  it('answers a malformed body with a JSON-RPC parse error, not a 500', async () => {
    const response = await POST(post('{ broken', { authorization: 'Bearer whatever' }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error.code).toBe(-32700);
  });

  it('routes a bearer request to the connector, never to the session handler', async () => {
    const response = await POST(
      post(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server/discover' }), {
        authorization: 'Bearer whatever',
      })
    );

    expect(response.status).toBe(200);
    expect((await response.json()).result.protocolVersions[0]).toBe('2026-07-28');
    expect(handleStreamableHTTPRequest).not.toHaveBeenCalled();
  });
});

describe('session path', () => {
  it('still works, and is not reached by a bearer request', async () => {
    // The branch is additive on purpose: nothing here calls this path today,
    // but "no caller I can find" is not "no caller".
    sessionValue.current = { user: { id: 'user-1' } };

    const response = await POST(post(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })));

    expect(response.status).toBe(200);
    expect(handleStreamableHTTPRequest).toHaveBeenCalledOnce();
  });
});

describe('discovery without a credential', () => {
  it('answers server/discover with no Authorization header at all', async () => {
    // The bug this exists for: the route gated the connector on the bearer
    // header, so an unauthenticated discover fell through to the session path
    // and was answered 401. Negotiating is what a client does *before* it can
    // authenticate, so that made discovery unreachable in exactly the case it
    // is for.
    //
    // The earlier route test asked for discover *with* a bearer token, which
    // passes either way — choosing the authenticated case is what hid this.
    const response = await POST(
      post(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server/discover' }))
    );

    expect(response.status).toBe(200);
    expect((await response.json()).result.protocolVersions[0]).toBe('2026-07-28');
    expect(handleStreamableHTTPRequest).not.toHaveBeenCalled();
  });

  it('still challenges an unauthenticated call to a non-public method', async () => {
    const response = await POST(
      post(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata');
  });

  it('does not let a session-transport request be mistaken for discovery', async () => {
    sessionValue.current = { user: { id: 'user-1' } };

    const response = await POST(
      post(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), {
        'Mcp-Session-Id': 'legacy-session',
      })
    );

    expect(handleStreamableHTTPRequest).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
  });
});
