import { createHash, randomBytes } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * OAuth 2.1 P0 security controls.
 *
 * This file previously asserted against an API that did not exist. It expected
 * validatePkceState to return null on rejection (it returns a discriminated
 * union), computed integrity hashes as sha256("state:server:user") (they are
 * HMAC-SHA256 over four pipe-joined fields including the code verifier), and
 * modelled server ownership as three sequential queries (it is one joined
 * query). None of that was caught, because the file failed to collect: its
 * import of lib/oauth/integrity resolved to nothing, vitest reported "no tests",
 * and all seventeen cases sat green-by-absence for as long as they existed.
 *
 * Two of them tested nothing even in principle — one awaited db.delete() and
 * then asserted db.delete had been called, which is an assertion about the mock.
 * Those are replaced by cases that exercise the real deletion paths.
 *
 * The rewrite therefore keeps every original intent and re-points it at the
 * shipped implementations.
 */

process.env.NEXTAUTH_SECRET = 'test-secret-for-oauth-integrity-hashes';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: {
      oauthPkceStatesTable: { findFirst: vi.fn() },
      mcpServerOAuthTokensTable: { findFirst: vi.fn() },
      mcpServersTable: { findFirst: vi.fn() },
      profilesTable: { findFirst: vi.fn() },
      projectsTable: { findFirst: vi.fn() },
    },
  },
}));

// safeFetch resolves each hop's hostname before fetching. The example.com names
// these suites use do not resolve, so DNS answers with one public address here
// — this is about token handling, not about name resolution.
vi.mock('node:dns/promises', () => ({
  default: { lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]) },
}));

vi.mock('@/db', () => ({ db: mockDb }));

vi.mock('@/lib/observability/logger', () => ({
  log: { oauth: vi.fn(), error: vi.fn(), security: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/observability/oauth-metrics', () => ({
  recordCodeInjectionAttempt: vi.fn(),
  recordIntegrityViolation: vi.fn(),
  recordTokenReuseDetected: vi.fn(),
  recordTokenRevocation: vi.fn(),
  recordPkceValidation: vi.fn(),
  recordTokenRefresh: vi.fn(),
}));

vi.mock('@/lib/encryption', () => ({
  encryptField: vi.fn((value: unknown) => `encrypted_${JSON.stringify(value)}`),
  decryptField: vi.fn((value: unknown) =>
    typeof value === 'string' && value.startsWith('encrypted_')
      ? JSON.parse(value.substring(10))
      : value
  ),
}));

vi.mock('@/lib/oauth/oauth-config-store', () => ({
  getOAuthConfig: vi.fn(),
}));

import { db } from '@/db';
import { encryptField } from '@/lib/encryption';
import { generateIntegrityHash, validatePkceState } from '@/lib/oauth/integrity';
import { getOAuthConfig } from '@/lib/oauth/oauth-config-store';
import { createPkceState } from '@/lib/oauth/pkce';
import { refreshOAuthToken } from '@/lib/oauth/token-refresh-service';
import { log } from '@/lib/observability/logger';
import {
  recordCodeInjectionAttempt,
  recordIntegrityViolation,
  recordTokenReuseDetected,
  recordTokenRevocation,
} from '@/lib/observability/oauth-metrics';

const SERVER_UUID = 'test-server-uuid';
const USER_ID = 'test-user-id';
const ATTACKER_ID = 'attacker-user-id';
const REDIRECT_URI = 'http://localhost:12005/api/oauth/callback';

/**
 * A stored PKCE row whose integrity hash is genuinely correct. Tests that need
 * a *bad* hash override integrity_hash explicitly, so the difference between
 * the valid and tampered cases is visible in the test body.
 */
function pkceRow(overrides: Record<string, unknown> = {}) {
  const state = (overrides.state as string) ?? 'state-abc';
  const serverUuid = (overrides.server_uuid as string) ?? SERVER_UUID;
  const userId = (overrides.user_id as string) ?? USER_ID;
  const codeVerifier = (overrides.code_verifier as string) ?? randomBytes(32).toString('base64url');

  return {
    state,
    server_uuid: serverUuid,
    user_id: userId,
    code_verifier: codeVerifier,
    redirect_uri: REDIRECT_URI,
    integrity_hash: generateIntegrityHash({ state, serverUuid, userId, codeVerifier }),
    expires_at: new Date(Date.now() + 120_000),
    created_at: new Date(),
    ...overrides,
  };
}

/**
 * validateServerOwnership issues one joined query:
 *   select().from(servers).innerJoin(profiles).innerJoin(projects).where().limit()
 * The old mocks stopped at .where(), which is why every ownership test died on
 * "innerJoin is not a function".
 */
function mockOwnership(rows: { user_id: string; server_uuid: string }[]) {
  const afterWhere = { limit: vi.fn().mockResolvedValue(rows) };
  const joined: Record<string, unknown> = {};
  joined.innerJoin = vi.fn(() => joined);
  joined.where = vi.fn(() => afterWhere);
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: vi.fn(() => joined) });
}

/**
 * db.update(...).set(...).where(...) is awaited directly on the lock-clearing
 * paths and has .returning() called on it during lock acquisition, so where()
 * must be both a promise and an object carrying returning().
 */
function mockUpdate(returningQueue: unknown[][]) {
  const setPayloads: Record<string, unknown>[] = [];
  let call = 0;
  (db.update as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    set: vi.fn((payload: Record<string, unknown>) => {
      setPayloads.push(payload);
      return {
        where: vi.fn(() => {
          const rows = returningQueue[Math.min(call, returningQueue.length - 1)] ?? [];
          call += 1;
          const result = Promise.resolve({ rowCount: 1 }) as Promise<unknown> & {
            returning: () => Promise<unknown[]>;
          };
          result.returning = () => Promise.resolve(rows);
          return result;
        }),
      };
    }),
  }));
  return setPayloads;
}

function tokenRow(overrides: Record<string, unknown> = {}) {
  return {
    uuid: 'token-uuid',
    server_uuid: SERVER_UUID,
    access_token_encrypted: encryptField('old_access_token'),
    refresh_token_encrypted: encryptField('old_refresh_token'),
    refresh_token_used_at: null,
    refresh_token_locked_at: new Date(),
    expires_at: new Date(Date.now() - 1000),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({
    where: vi.fn().mockResolvedValue({ rowCount: 1 }),
  });
  (db.query.mcpServersTable.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    uuid: SERVER_UUID,
    streamable_http_options_encrypted: encryptField({ headers: {} }),
  });
});

describe('Authorization code injection prevention (P0)', () => {
  it('rejects a state that belongs to another user', async () => {
    (db.query.oauthPkceStatesTable.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      pkceRow({ user_id: USER_ID })
    );

    const result = await validatePkceState('state-abc', ATTACKER_ID);

    expect(result).toEqual({ ok: false, reason: 'user_mismatch' });
    expect(recordCodeInjectionAttempt).toHaveBeenCalled();
  });

  it('accepts the same state for the user it was issued to', async () => {
    // The mismatch above must be about ownership, not about the row being
    // unusable — otherwise the test would pass for the wrong reason.
    (db.query.oauthPkceStatesTable.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      pkceRow({ user_id: USER_ID })
    );

    const result = await validatePkceState('state-abc', USER_ID);

    expect(result.ok).toBe(true);
    expect(recordCodeInjectionAttempt).not.toHaveBeenCalled();
  });

  it('reports a state nobody holds as not_found rather than as a mismatch', async () => {
    (db.query.oauthPkceStatesTable.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    expect(await validatePkceState('no-such-state', USER_ID)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(recordCodeInjectionAttempt).not.toHaveBeenCalled();
  });

  it('binds a new PKCE state to the user creating it', async () => {
    let inserted: Record<string, unknown> | undefined;
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn((values: Record<string, unknown>) => {
        inserted = values;
        return { returning: vi.fn().mockResolvedValue([values]) };
      }),
    });

    await createPkceState(SERVER_UUID, USER_ID, REDIRECT_URI);

    expect(inserted?.user_id).toBe(USER_ID);
    expect(inserted?.server_uuid).toBe(SERVER_UUID);
    // The hash must cover the row it is stored with, or verification later is
    // checking a hash against parameters it was never computed from.
    expect(inserted?.integrity_hash).toBe(
      generateIntegrityHash({
        state: inserted?.state as string,
        serverUuid: SERVER_UUID,
        userId: USER_ID,
        codeVerifier: inserted?.code_verifier as string,
      })
    );
  });
});

describe('PKCE state integrity verification (P0)', () => {
  it('accepts a row whose hash matches its parameters', async () => {
    const row = pkceRow({ state: 'integrity-ok' });
    (db.query.oauthPkceStatesTable.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(row);

    const result = await validatePkceState('integrity-ok', USER_ID);

    expect(result).toEqual({ ok: true, state: row });
  });

  it('rejects a tampered hash and destroys the state', async () => {
    (db.query.oauthPkceStatesTable.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      pkceRow({ state: 'tampered', integrity_hash: 'tampered_hash_value' })
    );

    const result = await validatePkceState('tampered', USER_ID);

    expect(result).toEqual({ ok: false, reason: 'integrity' });
    expect(recordIntegrityViolation).toHaveBeenCalledWith('hash_mismatch');
    // A state that failed verification must not survive to be retried.
    expect(db.delete).toHaveBeenCalled();
  });

  it('detects substitution of the server the state was issued for', async () => {
    // The hash commits to the original server_uuid; the stored row names a
    // different one. This is the attack the hash exists to catch.
    const original = pkceRow({ state: 'substituted' });
    (db.query.oauthPkceStatesTable.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...original,
      server_uuid: 'substituted-server-uuid',
    });

    expect(await validatePkceState('substituted', USER_ID)).toEqual({
      ok: false,
      reason: 'integrity',
    });
  });

  it('is not fooled by a hash built the way the old tests built it', async () => {
    // sha256("state:server:user") — no secret, no code verifier. If this ever
    // verifies, the integrity hash has stopped being a MAC.
    const state = 'legacy-hash';
    (db.query.oauthPkceStatesTable.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      pkceRow({
        state,
        integrity_hash: createHash('sha256')
          .update(`${state}:${SERVER_UUID}:${USER_ID}`)
          .digest('hex'),
      })
    );

    expect(await validatePkceState(state, USER_ID)).toEqual({ ok: false, reason: 'integrity' });
  });

  it('separates an expired state from an invalid one', async () => {
    // The callback reports these differently to the user and to metrics, so
    // collapsing them would be a real regression.
    (db.query.oauthPkceStatesTable.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      pkceRow({ state: 'stale', expires_at: new Date(Date.now() - 1000) })
    );

    expect(await validatePkceState('stale', USER_ID)).toEqual({ ok: false, reason: 'expired' });
    expect(db.delete).toHaveBeenCalled();
  });
});

describe('Refresh token reuse detection (P0)', () => {
  beforeEach(() => {
    mockOwnership([{ user_id: USER_ID, server_uuid: SERVER_UUID }]);
  });

  it('revokes every token when a refresh token is replayed', async () => {
    mockUpdate([[tokenRow({ refresh_token_used_at: new Date(Date.now() - 1000) })]]);

    const result = await refreshOAuthToken(SERVER_UUID, USER_ID);

    expect(result).toBe(false);
    expect(recordTokenReuseDetected).toHaveBeenCalled();
    expect(recordTokenRevocation).toHaveBeenCalledWith('reuse_detected');
    expect(db.delete).toHaveBeenCalled();
  });

  it('treats a use older than the detection window as normal rotation', async () => {
    // Reuse detection is windowed at 10s. A token legitimately rotated an hour
    // ago must not be mistaken for a replay, or every long-lived connection
    // would revoke itself.
    mockUpdate([[tokenRow({ refresh_token_used_at: new Date(Date.now() - 3_600_000) })]]);
    (getOAuthConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      client_id: 'test-client-id',
      token_endpoint: 'https://auth.example.com/token',
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new', refresh_token: 'new_r', expires_in: 3600 }),
    }) as unknown as typeof fetch;

    const result = await refreshOAuthToken(SERVER_UUID, USER_ID);

    expect(result).toBe(true);
    expect(recordTokenReuseDetected).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('marks the old refresh token used once rotation succeeds', async () => {
    const setPayloads = mockUpdate([[tokenRow()]]);
    (getOAuthConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      client_id: 'test-client-id',
      token_endpoint: 'https://auth.example.com/token',
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        expires_in: 3600,
      }),
    }) as unknown as typeof fetch;

    const result = await refreshOAuthToken(SERVER_UUID, USER_ID);

    expect(result).toBe(true);
    // Located by content, not by position: rotation is followed by a write to
    // the server's streamable options, so the last payload is not this one.
    const rotation = setPayloads.find((p) => 'access_token_encrypted' in p);
    expect(rotation?.refresh_token_used_at).toBeInstanceOf(Date);
    expect(rotation?.refresh_token_locked_at).toBeNull();
    expect(rotation?.access_token_encrypted).toBe(encryptField('new_access_token'));
  });

  it('defers to the holder when the lock cannot be acquired', async () => {
    // Lock contention is signalled by the UPDATE matching no rows, not by
    // inspecting a returned timestamp — the old test asserted the latter and so
    // never exercised this branch at all.
    mockUpdate([[]]);
    (db.query.mcpServerOAuthTokensTable.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      server_uuid: SERVER_UUID,
      refresh_token_locked_at: null,
      expires_at: new Date(Date.now() + 3_600_000),
    });

    const result = await refreshOAuthToken(SERVER_UUID, USER_ID);

    expect(result).toBe(true);
  });
});

describe('Server ownership validation (P0)', () => {
  it('refuses to refresh a server owned by somebody else', async () => {
    mockOwnership([{ user_id: 'different-user-id', server_uuid: SERVER_UUID }]);
    mockUpdate([[tokenRow()]]);

    const result = await refreshOAuthToken(SERVER_UUID, USER_ID);

    expect(result).toBe(false);
    expect(log.security).toHaveBeenCalledWith(
      'oauth_ownership_violation',
      USER_ID,
      expect.objectContaining({ serverUuid: SERVER_UUID })
    );
    // The ownership check must gate the lock, not run alongside it.
    expect(db.update).not.toHaveBeenCalled();
  });

  it('validates the chain server → profile → project → user in one query', async () => {
    mockOwnership([{ user_id: USER_ID, server_uuid: SERVER_UUID }]);
    mockUpdate([[tokenRow({ expires_at: new Date(Date.now() + 3_600_000) })]]);

    const result = await refreshOAuthToken(SERVER_UUID, USER_ID);

    // Token is still valid, so this returns true without contacting the IdP.
    expect(result).toBe(true);
    expect(db.select).toHaveBeenCalled();
  });

  it('refuses when the server does not exist', async () => {
    mockOwnership([]);

    const result = await refreshOAuthToken('non-existent-server', USER_ID);

    expect(result).toBe(false);
    expect(log.security).toHaveBeenCalledWith(
      'oauth_server_not_found',
      USER_ID,
      expect.objectContaining({ serverUuid: 'non-existent-server' })
    );
  });
});

describe('Security event logging', () => {
  it('records the presenting user when a state is hijacked', async () => {
    (db.query.oauthPkceStatesTable.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      pkceRow({ state: 'victim-state', user_id: USER_ID })
    );

    await validatePkceState('victim-state', ATTACKER_ID);

    expect(log.security).toHaveBeenCalledWith(
      'pkce_state_user_mismatch',
      ATTACKER_ID,
      expect.objectContaining({ state: 'victim-state', expectedUser: USER_ID })
    );
  });

  it('records integrity violations against the state that failed', async () => {
    (db.query.oauthPkceStatesTable.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      pkceRow({ state: 'tampered-state', integrity_hash: 'invalid_hash' })
    );

    await validatePkceState('tampered-state', USER_ID);

    expect(log.security).toHaveBeenCalledWith(
      'pkce_state_integrity_violation',
      USER_ID,
      expect.objectContaining({ state: 'tampered-state' })
    );
  });

  it('records when the replayed token was previously used', async () => {
    mockOwnership([{ user_id: USER_ID, server_uuid: SERVER_UUID }]);
    const usedAt = new Date(Date.now() - 5000);
    mockUpdate([[tokenRow({ refresh_token_used_at: usedAt })]]);

    await refreshOAuthToken(SERVER_UUID, USER_ID);

    expect(log.security).toHaveBeenCalledWith(
      'oauth_refresh_token_reuse_detected',
      USER_ID,
      expect.objectContaining({ serverUuid: SERVER_UUID, tokenUsedAt: usedAt })
    );
    expect(log.security).toHaveBeenCalledWith(
      'oauth_tokens_revoked',
      USER_ID,
      expect.objectContaining({ reason: 'refresh_token_reuse' })
    );
  });
});
