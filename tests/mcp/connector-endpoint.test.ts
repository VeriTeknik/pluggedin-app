import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The endpoint's authentication behaviour, which is what §2 of the deploy doc
 * checks and what decides whether Claude can start the OAuth flow at all.
 *
 * The header is only honoured on a 401 — Anthropic's documentation is explicit
 * that a WWW-Authenticate on a 200 is ignored. Returning a tool error instead
 * of the challenge is the single most common way this integration fails
 * silently, because everything else keeps working: discovery resolves, the
 * consent screen renders, tokens issue, and the client simply never learns
 * where to send the user.
 */

const { mockDb } = vi.hoisted(() => ({ mockDb: { select: vi.fn(), update: vi.fn() } }));
vi.mock('@/db', () => ({ db: mockDb }));

process.env.NEXTAUTH_SECRET = 'connector-endpoint-test-secret';
process.env.NEXTAUTH_URL = 'https://plugged.in';

import { db } from '@/db';
import { handleConnectorRequest } from '@/lib/mcp/connector/handle-request';

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://plugged.in/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function tokenRow(overrides: Record<string, unknown> = {}) {
  return {
    uuid: 'token-1',
    user_id: 'user-1',
    granted_project_uuids: ['11111111-1111-1111-1111-111111111111'],
    default_project_uuid: null,
    scopes: ['hubs:read'],
    revoked_at: null,
    expires_at: new Date(Date.now() + 3_600_000),
    ...overrides,
  };
}

function tokenLookup(rows: Record<string, unknown>[]) {
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) })) })),
  });
  // authenticateConnectorRequest stamps last_used_at fire-and-forget.
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
    set: vi.fn(() => ({ where: vi.fn().mockResolvedValue({ rowCount: 1 }) })),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('authentication', () => {
  it('challenges an unauthenticated call with 401 and a resource_metadata pointer', async () => {
    const response = await handleConnectorRequest(
      post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      { jsonrpc: '2.0', id: 1, method: 'tools/list' }
    );

    expect(response.status).toBe(401);
    const header = response.headers.get('www-authenticate') ?? '';
    expect(header).toContain('Bearer');
    expect(header).toContain('https://plugged.in/.well-known/oauth-protected-resource');
  });

  it('challenges rather than answering when the token is expired', async () => {
    tokenLookup([tokenRow({ expires_at: new Date(Date.now() - 1000) })]);

    const response = await handleConnectorRequest(
      post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { authorization: 'Bearer whatever' }),
      { jsonrpc: '2.0', id: 1, method: 'tools/list' }
    );

    expect(response.status).toBe(401);
  });

  it('challenges rather than answering when the token is revoked', async () => {
    tokenLookup([tokenRow({ revoked_at: new Date() })]);

    const response = await handleConnectorRequest(
      post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { authorization: 'Bearer whatever' }),
      { jsonrpc: '2.0', id: 1, method: 'tools/list' }
    );

    expect(response.status).toBe(401);
  });

  it('answers server/discover without a token, on 200', async () => {
    const body = { jsonrpc: '2.0', id: 1, method: 'server/discover' };
    const response = await handleConnectorRequest(post(body), body);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.result.protocolVersions[0]).toBe('2026-07-28');
    // Discovery must not have needed the database.
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe('envelope', () => {
  it('rejects a malformed body with a JSON-RPC error, not a crash', async () => {
    const response = await handleConnectorRequest(post({ nope: true }), { nope: true });
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error.code).toBe(-32600);
  });

  it('does not reply to a notification', async () => {
    tokenLookup([tokenRow()]);
    const body = { jsonrpc: '2.0', method: 'notifications/initialized' };

    const response = await handleConnectorRequest(
      post(body, { authorization: 'Bearer whatever' }),
      body
    );

    // JSON-RPC forbids answering a request without an id; some clients treat a
    // reply as a hard protocol error.
    expect(response.status).toBe(202);
    expect(await response.text()).toBe('');
  });

  it('echoes the request id on a real call', async () => {
    tokenLookup([tokenRow()]);
    const body = { jsonrpc: '2.0', id: 'abc', method: 'ping' };

    const response = await handleConnectorRequest(
      post(body, { authorization: 'Bearer whatever' }),
      body
    );

    const payload = await response.json();
    expect(payload.id).toBe('abc');
  });

  it('never caches a response', async () => {
    const body = { jsonrpc: '2.0', id: 1, method: 'server/discover' };
    const response = await handleConnectorRequest(post(body), body);
    // Every answer depends on the bearer token; a shared cache in front of this
    // would hand one tenant's reply to another.
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('survives a failing last_used_at write', async () => {
    // The stamp is telemetry and runs fire-and-forget. Before it carried a
    // catch, a rejection here was an unhandled promise rejection — which Node
    // turns into process termination by default, on a request that had already
    // succeeded.
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([tokenRow()]) })) })),
    });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn(() => ({ where: vi.fn().mockRejectedValue(new Error('connection lost')) })),
    });

    const body = { jsonrpc: '2.0', id: 1, method: 'ping' };
    const response = await handleConnectorRequest(
      post(body, { authorization: 'Bearer whatever' }),
      body
    );

    expect(response.status).toBe(200);
    // Let the rejection settle: an unhandled one would surface here.
    await new Promise((r) => setTimeout(r, 10));
  });
});
