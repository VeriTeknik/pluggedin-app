/**
 * Re-entering the current password (removePassword, and the REST twin) was a
 * password oracle for whoever holds a session. The REST route sat behind an
 * IP-keyed rate limit, but the server action had none, failed guesses did not
 * count toward the account lockout, and the 1 s delay on a wrong guess did
 * nothing against requests sent in parallel — each still ran a bcrypt compare.
 *
 * Now every re-verification goes through one path that (per user, shared by the
 * action and the route) refuses while another check for the same user is in
 * flight, refuses a locked account, spends the same budget as the REST route's
 * limiter (10 per hour), and records each wrong guess toward the lockout.
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
  locked: false,
  isAccountLocked: vi.fn(),
  recordFailedLoginAttempt: vi.fn(),
}));

vi.mock('bcrypt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bcrypt')>();
  return { ...actual, default: actual, compare: vi.fn(actual.compare) };
});
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => m.session, authOptions: {} }));
vi.mock('next-auth/next', () => ({ getServerSession: async () => m.session }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/csrf-protection', () => ({ validateCSRF: async () => null }));
vi.mock('@/lib/rate-limiter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limiter')>()),
  // The route's own IP limiter is not what is under test.
  RateLimiters: { sensitive: async () => ({ allowed: true, limit: 10, remaining: 9, reset: 0 }) },
}));
vi.mock('@/lib/email', () => ({
  generatePasswordRemovedEmail: vi.fn(() => ({})),
  generatePasswordSetEmail: vi.fn(() => ({})),
  sendEmail: vi.fn(async () => true),
}));
vi.mock('@/lib/auth-security', () => ({
  isPasswordComplex: () => ({ isValid: true, errors: [] }),
  recordPasswordChange: vi.fn(async () => undefined),
  isAccountLocked: m.isAccountLocked,
  recordFailedLoginAttempt: m.recordFailedLoginAttempt,
}));
vi.mock('@/db', () => ({
  db: {
    query: { users: { findFirst: async () => m.user } },
    update: () => ({ set: (values: unknown) => (m.set(values), { where: async () => undefined }) }),
  },
}));

import { compare } from 'bcrypt';

import { removePassword } from '@/app/(sidebar-layout)/(container)/settings/actions';
import { POST as removePasswordRoute } from '@/app/api/settings/password/remove/route';
import { POST as changePasswordRoute } from '@/app/api/settings/password/route';
import { verifyCurrentPassword } from '@/lib/credential-reverification';

const compareSpy = vi.mocked(compare);

let seq = 0;
/** The limiter is a module singleton, so every test gets a user of its own. */
function freshUser() {
  seq += 1;
  const id = `user-${seq}`;
  return { id, email: `${id}@example.com`, password: HASH };
}

function useAccount(user: { id: string; email: string; password: string }) {
  m.session = { user: { id: user.id } };
  m.user = { ...user, accounts: [{ provider: 'github' }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.isAccountLocked.mockImplementation(async () => m.locked);
  m.recordFailedLoginAttempt.mockResolvedValue({ locked: false, remainingAttempts: 4 });
  m.locked = false;
});

describe('verifyCurrentPassword is throttled per user', () => {
  it('accepts the right password and refuses a wrong one', async () => {
    const user = freshUser();

    expect(await verifyCurrentPassword(user, CURRENT)).toEqual({ ok: true });
    expect(await verifyCurrentPassword(user, 'wrong-guess-1')).toEqual({ ok: false, reason: 'incorrect' });
  });

  it('records a wrong guess toward the account lockout', async () => {
    const user = freshUser();

    await verifyCurrentPassword(user, 'wrong-guess-1');

    expect(m.recordFailedLoginAttempt).toHaveBeenCalledWith(user.email, expect.any(String), expect.any(String));
  });

  it('refuses a locked account without comparing, even with the right password', async () => {
    const user = freshUser();
    m.locked = true;

    expect(await verifyCurrentPassword(user, CURRENT)).toEqual({ ok: false, reason: 'throttled' });
    expect(compareSpy).not.toHaveBeenCalled();
  });

  it('stops comparing after the hourly budget (10) is spent', async () => {
    const user = freshUser();
    for (let i = 0; i < 10; i++) {
      expect(await verifyCurrentPassword(user, CURRENT)).toEqual({ ok: true });
    }
    compareSpy.mockClear();

    expect(await verifyCurrentPassword(user, CURRENT)).toEqual({ ok: false, reason: 'throttled' });
    expect(compareSpy).not.toHaveBeenCalled();
  });

  it('keeps budgets separate per user', async () => {
    const spent = freshUser();
    for (let i = 0; i < 10; i++) await verifyCurrentPassword(spent, CURRENT);

    expect(await verifyCurrentPassword(freshUser(), CURRENT)).toEqual({ ok: true });
  });

  it('runs one compare at a time per user: parallel guesses are refused, not queued', async () => {
    const user = freshUser();

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => verifyCurrentPassword(user, `parallel-guess-${i}`))
    );

    expect(compareSpy).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => !r.ok && r.reason === 'throttled')).toHaveLength(4);
  });
});

describe('the removePassword server action spends the same budget', () => {
  it('refuses once the user has used up their attempts, without comparing', async () => {
    const user = freshUser();
    useAccount(user);
    for (let i = 0; i < 10; i++) await verifyCurrentPassword(user, CURRENT);
    compareSpy.mockClear();

    const result = await removePassword({ confirmEmail: user.email, currentPassword: CURRENT });

    expect(result.success).toBe(false);
    expect((result as { code?: string }).code).toBe('RATE_LIMITED');
    expect(compareSpy).not.toHaveBeenCalled();
    expect(m.set).not.toHaveBeenCalled();
  });

  it('feeds a wrong guess into the lockout', async () => {
    const user = freshUser();
    useAccount(user);

    const result = await removePassword({ confirmEmail: user.email, currentPassword: 'wrong-guess-1' });

    expect(result.success).toBe(false);
    expect(m.recordFailedLoginAttempt).toHaveBeenCalledWith(user.email, expect.any(String), expect.any(String));
    expect(m.set).not.toHaveBeenCalled();
  });

  it('still removes the password with the right one', async () => {
    const user = freshUser();
    useAccount(user);

    const result = await removePassword({ confirmEmail: user.email, currentPassword: CURRENT });

    expect(result).toEqual({ success: true });
    expect(m.set).toHaveBeenCalledWith(expect.objectContaining({ password: null }));
  });
});

describe('POST /api/settings/password (change) re-verifies through the same path', () => {
  const change = (currentPassword: string) =>
    changePasswordRoute(
      new NextRequest('http://localhost/api/settings/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword: 'Brand-New-Pass-2!',
          confirmPassword: 'Brand-New-Pass-2!',
        }),
      })
    );

  it('counts a wrong current password toward the lockout', async () => {
    const user = freshUser();
    useAccount(user);

    const response = await change('wrong-guess-1');

    expect(response.status).toBe(400);
    expect(m.recordFailedLoginAttempt).toHaveBeenCalledWith(user.email, expect.any(String), expect.any(String));
    expect(m.set).not.toHaveBeenCalled();
  });

  it('answers 429 without comparing once the per-user budget is spent', async () => {
    const user = freshUser();
    useAccount(user);
    for (let i = 0; i < 10; i++) await verifyCurrentPassword(user, CURRENT);
    compareSpy.mockClear();

    const response = await change(CURRENT);

    expect(response.status).toBe(429);
    expect(compareSpy).not.toHaveBeenCalled();
    expect(m.set).not.toHaveBeenCalled();
  });

  it('still changes the password with the right current password', async () => {
    const user = freshUser();
    useAccount(user);

    const response = await change(CURRENT);

    expect(response.status).toBe(200);
    expect(m.set).toHaveBeenCalledWith(expect.objectContaining({ password: expect.any(String) }));
  });
});

describe('POST /api/settings/password/remove shares the per-user budget', () => {
  it('answers 429 once the user has used up their attempts through the action', async () => {
    const user = freshUser();
    useAccount(user);
    for (let i = 0; i < 10; i++) await verifyCurrentPassword(user, CURRENT);
    compareSpy.mockClear();

    const response = await removePasswordRoute(
      new NextRequest('http://localhost/api/settings/password/remove', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmEmail: user.email, currentPassword: CURRENT }),
      })
    );

    expect(response.status).toBe(429);
    expect(compareSpy).not.toHaveBeenCalled();
    expect(m.set).not.toHaveBeenCalled();
  });
});
