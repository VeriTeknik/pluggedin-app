/**
 * The REST twins of the settings actions (deepsec
 * pluggedin-app-other-reauthentication-bypass-396552eeff).
 *
 * POST /api/settings/password/remove cleared the password on the session plus
 * the account email — which the settings page shows to whoever holds the
 * session — and POST /api/settings/password/set then accepted any new password
 * because none was set. A stolen session could so turn itself into a permanent
 * password login. The settings actions were fixed; these routes had the same
 * gap. Same rule now: removal needs the current password, setting one on an
 * OAuth-only account needs THIS session to have signed in recently through a
 * linked provider.
 */
import { hashSync } from 'bcrypt';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CURRENT = 'Correct-Horse-9!';
const HASH = hashSync(CURRENT, 4);

const m = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  user: null as null | Record<string, unknown>,
  set: vi.fn(),
}));

vi.mock('next-auth/next', () => ({ getServerSession: async () => m.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/csrf-protection', () => ({ validateCSRF: async () => null }));
vi.mock('@/lib/rate-limiter', () => ({
  RateLimiters: { sensitive: async () => ({ allowed: true, limit: 10, remaining: 9, reset: 0 }) },
  rateLimiter: { check: async () => ({ success: true, remaining: 9, reset: 3600 }) },
}));
vi.mock('@/lib/email', () => ({
  generatePasswordRemovedEmail: vi.fn(() => ({})),
  generatePasswordSetEmail: vi.fn(() => ({})),
  sendEmail: vi.fn(async () => true),
}));
vi.mock('@/lib/auth-security', () => ({
  isPasswordComplex: () => ({ isValid: true, errors: [] }),
  recordPasswordChange: vi.fn(async () => undefined),
  isAccountLocked: vi.fn(async () => false),
  recordFailedLoginAttempt: vi.fn(async () => ({ locked: false, remainingAttempts: 4 })),
}));
vi.mock('@/lib/logger', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/db', () => ({
  db: {
    query: { users: { findFirst: async () => m.user } },
    update: () => ({ set: (values: unknown) => (m.set(values), { where: async () => undefined }) }),
  },
}));

import { POST as removePassword } from '@/app/api/settings/password/remove/route';
import { POST as setPassword } from '@/app/api/settings/password/set/route';

const minutesAgo = (n: number) => Date.now() - n * 60_000;

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.session = { user: { id: 'owner' } };
});

describe('POST /api/settings/password/remove requires the current password', () => {
  const remove = (body: unknown) => removePassword(post('/api/settings/password/remove', body));

  beforeEach(() => {
    m.user = {
      id: 'owner',
      email: 'owner@example.com',
      password: HASH,
      accounts: [{ provider: 'github', last_used: new Date() }],
    };
  });

  it('refuses when only the email is supplied', async () => {
    const response = await remove({ confirmEmail: 'owner@example.com' });

    expect(response.status).toBe(400);
    expect(m.set).not.toHaveBeenCalled();
  });

  it('refuses a wrong current password', async () => {
    const response = await remove({ confirmEmail: 'owner@example.com', currentPassword: 'guess-123456' });

    expect(response.status).toBe(400);
    expect((await response.json()).success).toBe(false);
    expect(m.set).not.toHaveBeenCalled();
  });

  it('still requires the email confirmation', async () => {
    const response = await remove({ confirmEmail: 'someone@else.com', currentPassword: CURRENT });

    expect(response.status).toBe(400);
    expect(m.set).not.toHaveBeenCalled();
  });

  it('removes the password when the current password is correct', async () => {
    const response = await remove({ confirmEmail: 'owner@example.com', currentPassword: CURRENT });

    expect(response.status).toBe(200);
    expect(m.set).toHaveBeenCalledWith(expect.objectContaining({ password: null }));
  });
});

describe('POST /api/settings/password/set requires this session to have re-authenticated', () => {
  const set = () =>
    setPassword(
      post('/api/settings/password/set', { newPassword: 'Fresh-Password-1!', confirmPassword: 'Fresh-Password-1!' })
    );

  beforeEach(() => {
    m.user = {
      id: 'owner',
      email: 'owner@example.com',
      password: null,
      // The owner signed in with GitHub a moment ago — possibly on another device.
      accounts: [{ provider: 'github', last_used: new Date() }],
    };
  });

  it('refuses a session without a sign-in stamp', async () => {
    const response = await set();

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('REAUTH_REQUIRED');
    expect(m.set).not.toHaveBeenCalled();
  });

  it("refuses an old session riding on the owner's fresh sign-in elsewhere", async () => {
    m.session = { user: { id: 'owner' }, authTime: minutesAgo(90), authProvider: 'github' };

    const response = await set();

    expect(response.status).toBe(403);
    expect(m.set).not.toHaveBeenCalled();
  });

  it('refuses an account with no linked provider', async () => {
    m.session = { user: { id: 'owner' }, authTime: minutesAgo(1), authProvider: 'github' };
    m.user = { ...m.user, accounts: [] };

    const response = await set();

    expect(response.status).toBe(403);
    expect(m.set).not.toHaveBeenCalled();
  });

  it('sets the password for a session that just signed in through a linked provider', async () => {
    m.session = { user: { id: 'owner' }, authTime: minutesAgo(1), authProvider: 'github' };

    const response = await set();

    expect(response.status).toBe(200);
    expect(m.set).toHaveBeenCalledWith(expect.objectContaining({ password: expect.any(String) }));
  });

  it('still refuses when a password already exists', async () => {
    m.session = { user: { id: 'owner' }, authTime: minutesAgo(1), authProvider: 'github' };
    m.user = { ...m.user, password: HASH };

    const response = await set();

    expect(response.status).toBe(400);
    expect(m.set).not.toHaveBeenCalled();
  });
});
