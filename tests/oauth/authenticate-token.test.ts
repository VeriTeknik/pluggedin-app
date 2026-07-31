import { beforeEach, describe, expect, it, vi } from 'vitest';

const selected: unknown[] = [];

// The db module is mocked so the branches can be driven directly. `limit`
// resolves to whatever `selected` holds; `update` is a no-op chain.
vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(selected) }),
      }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
  },
}));

import { authenticateConnectorRequest } from '@/lib/oauth/authenticate';

const FUTURE = new Date(Date.now() + 3_600_000);
const PAST = new Date(Date.now() - 1_000);

function request(header?: string): Request {
  return new Request('https://plugged.in/api/mcp', {
    method: 'POST',
    headers: header ? { authorization: header } : {},
  });
}

function tokenRow(overrides: Record<string, unknown> = {}) {
  return {
    uuid: 'token-uuid',
    user_id: 'user-1',
    granted_project_uuids: ['hub-a', 'hub-b'],
    default_project_uuid: 'hub-a',
    scopes: ['library:read'],
    expires_at: FUTURE,
    revoked_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  selected.length = 0;
  process.env.NEXTAUTH_URL = 'https://plugged.in';
});

describe('authenticateConnectorRequest', () => {
  it('challenges a request with no Authorization header', async () => {
    const result = await authenticateConnectorRequest(request());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('challenges a non-Bearer scheme', async () => {
    const result = await authenticateConnectorRequest(request('Basic abc'));
    expect(result.ok).toBe(false);
  });

  it('challenges an unknown token', async () => {
    const result = await authenticateConnectorRequest(request('Bearer nope'));
    expect(result.ok).toBe(false);
  });

  it('challenges an expired token', async () => {
    selected.push(tokenRow({ expires_at: PAST }));
    const result = await authenticateConnectorRequest(request('Bearer x'));
    expect(result.ok).toBe(false);
  });

  it('challenges a revoked token even when unexpired', async () => {
    selected.push(tokenRow({ revoked_at: PAST }));
    const result = await authenticateConnectorRequest(request('Bearer x'));
    expect(result.ok).toBe(false);
  });

  it('returns the identity for a live token, carrying the Hub set', async () => {
    selected.push(tokenRow());
    const result = await authenticateConnectorRequest(request('Bearer x'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.identity.userId).toBe('user-1');
      expect(result.identity.grantedProjectUuids).toEqual(['hub-a', 'hub-b']);
      expect(result.identity.defaultProjectUuid).toBe('hub-a');
      expect(result.identity.scopes).toEqual(['library:read']);
    }
  });
});
