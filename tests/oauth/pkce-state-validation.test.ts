import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Covers the PKCE-state controls extracted from app/api/oauth/callback/route.ts.
 *
 * The controls are not new — binding state to user_id and verifying the
 * integrity hash have been in the callback all along — but inline in a route
 * handler they could not be unit tested. tests/oauth/oauth-security.test.ts
 * nominally covers this ground, but that file has never run (it failed to
 * collect) and is itself broken, so these are written fresh.
 */

const stored: { value: Record<string, unknown> | undefined } = { value: undefined };
const deleted: string[] = [];

vi.mock('@/db', () => ({
  db: {
    query: {
      oauthPkceStatesTable: {
        findFirst: () => Promise.resolve(stored.value),
      },
    },
    delete: () => ({
      where: (condition: unknown) => {
        deleted.push(String(condition));
        return Promise.resolve([]);
      },
    }),
  },
}));

const securityEvents: { action: string; userId: string | null }[] = [];
vi.mock('@/lib/observability/logger', () => ({
  log: {
    security: (action: string, userId: string | null) => securityEvents.push({ action, userId }),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    oauth: vi.fn(),
  },
}));

const metricCalls: string[] = [];
vi.mock('@/lib/observability/oauth-metrics', () => ({
  recordCodeInjectionAttempt: () => metricCalls.push('code_injection'),
  recordIntegrityViolation: (type: string) => metricCalls.push(`integrity_violation:${type}`),
  recordPkceValidation: (ok: boolean, reason?: string) =>
    metricCalls.push(`validation:${ok ? 'ok' : reason}`),
}));

import { generateIntegrityHash, validatePkceState } from '@/lib/oauth/integrity';

const OWNER = 'user-owner';
const ATTACKER = 'user-attacker';
const SERVER = '22222222-2222-2222-2222-222222222222';
const STATE = 'state-value';
const VERIFIER = 'verifier-value';

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    state: STATE,
    server_uuid: SERVER,
    user_id: OWNER,
    code_verifier: VERIFIER,
    redirect_uri: 'https://plugged.in/api/oauth/callback',
    integrity_hash: generateIntegrityHash({
      state: STATE,
      serverUuid: SERVER,
      userId: OWNER,
      codeVerifier: VERIFIER,
    }),
    expires_at: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = 'test-secret-for-integrity-hashes';
  stored.value = undefined;
  deleted.length = 0;
  securityEvents.length = 0;
  metricCalls.length = 0;
});

describe('validatePkceState', () => {
  it('returns the state when the owner presents it', async () => {
    stored.value = validRow();
    const result = await validatePkceState(STATE, OWNER);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.code_verifier).toBe(VERIFIER);
  });

  it('returns null for an unknown state', async () => {
    stored.value = undefined;
    expect((await validatePkceState(STATE, OWNER)).ok).toBe(false);
  });

  it('refuses a state that belongs to another user, and records the attempt', async () => {
    // Authorization code injection: the attacker holds a code for a flow they
    // did not start. This is the control the whole extraction exists for.
    stored.value = validRow();
    expect((await validatePkceState(STATE, ATTACKER)).ok).toBe(false);
    expect(metricCalls).toContain('code_injection');
    expect(securityEvents.map((e) => e.action)).toContain('pkce_state_user_mismatch');
  });

  it('does not delete a state merely because the wrong user asked for it', async () => {
    // The legitimate owner must still be able to complete their flow; deleting
    // here would let an attacker deny service by guessing state values.
    stored.value = validRow();
    await validatePkceState(STATE, ATTACKER);
    expect(deleted).toHaveLength(0);
  });

  it('refuses a tampered integrity hash, records it, and destroys the state', async () => {
    stored.value = validRow({ integrity_hash: 'a'.repeat(64) });
    expect((await validatePkceState(STATE, OWNER)).ok).toBe(false);
    expect(metricCalls).toContain('integrity_violation:hash_mismatch');
    expect(deleted).toHaveLength(1);
  });

  it('detects a hash bound to a different server', async () => {
    // Substitution: a valid hash, but for another server's flow.
    stored.value = validRow({
      integrity_hash: generateIntegrityHash({
        state: STATE,
        serverUuid: '33333333-3333-3333-3333-333333333333',
        userId: OWNER,
        codeVerifier: VERIFIER,
      }),
    });
    expect((await validatePkceState(STATE, OWNER)).ok).toBe(false);
    expect(metricCalls).toContain('integrity_violation:hash_mismatch');
  });

  it('refuses an expired state and destroys it', async () => {
    stored.value = validRow({ expires_at: new Date(Date.now() - 1_000) });
    expect((await validatePkceState(STATE, OWNER)).ok).toBe(false);
    expect(deleted).toHaveLength(1);
  });

  it('reports WHY it failed, so the caller can tell expiry from rejection', async () => {
    // The callback distinguishes these in its metrics and in the error shown to
    // the user; collapsing them into a bare null lost that.
    stored.value = validRow({ expires_at: new Date(Date.now() - 1_000) });
    const expired = await validatePkceState(STATE, OWNER);
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.reason).toBe('expired');

    stored.value = validRow();
    const mismatch = await validatePkceState(STATE, ATTACKER);
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.reason).toBe('user_mismatch');
  });

  it('records a validation metric on every path, including expiry', async () => {
    stored.value = validRow({ expires_at: new Date(Date.now() - 1_000) });
    await validatePkceState(STATE, OWNER);
    expect(metricCalls).toContain('validation:expired');

    metricCalls.length = 0;
    stored.value = validRow();
    await validatePkceState(STATE, OWNER);
    expect(metricCalls).toContain('validation:ok');
  });

  it('refuses a state with no owner at all', async () => {
    stored.value = validRow({ user_id: null });
    expect((await validatePkceState(STATE, OWNER)).ok).toBe(false);
  });
});
