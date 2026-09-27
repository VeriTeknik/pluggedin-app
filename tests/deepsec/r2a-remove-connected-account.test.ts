/**
 * removeConnectedAccount unlinked a sign-in provider on the session alone. A
 * stolen session could strip the owner's own providers (after, before the
 * signIn fix, linking its own), and the "last sign-in method" rule counted
 * account rows while deleting every row of the provider, so an account with two
 * GitHub logins and no password could lose both.
 *
 * Now unlinking re-verifies like setting a password does: the current password
 * on accounts that have one; otherwise a sign-in by THIS session within five
 * minutes through a DIFFERENT provider that stays linked. And it never leaves an
 * account without a way to sign in.
 */
import { hashSync } from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CURRENT = 'Correct-Horse-9!';
const HASH = hashSync(CURRENT, 4);

const m = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  user: null as null | Record<string, unknown>,
  deleted: vi.fn(),
  recordFailedLoginAttempt: vi.fn(),
  rateLimited: false,
}));

vi.mock('@/lib/auth', () => ({ getAuthSession: async () => m.session }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/email', () => ({
  generatePasswordRemovedEmail: vi.fn(() => ({})),
  generatePasswordSetEmail: vi.fn(() => ({})),
  sendEmail: vi.fn(async () => true),
}));
vi.mock('@/lib/auth-security', () => ({
  isPasswordComplex: () => ({ isValid: true, errors: [] }),
  recordPasswordChange: vi.fn(async () => undefined),
  isAccountLocked: vi.fn(async () => false),
  recordFailedLoginAttempt: m.recordFailedLoginAttempt,
}));
vi.mock('@/lib/rate-limiter', () => ({
  rateLimiter: {
    check: async () => ({ success: !m.rateLimited, remaining: m.rateLimited ? 0 : 9, reset: 3600 }),
  },
}));
vi.mock('@/db', () => ({
  db: {
    query: { users: { findFirst: async () => m.user } },
    delete: () => ({ where: async (...args: unknown[]) => m.deleted(...args) }),
  },
}));

import { removeConnectedAccount } from '@/app/(sidebar-layout)/(container)/settings/actions';
import { hasRecentReauthentication, reauthenticatedUntil } from '@/lib/credential-reverification';

const minutesAgo = (n: number) => Date.now() - n * 60_000;
const account = (provider: string, providerAccountId = `${provider}-1`) => ({ provider, providerAccountId });

beforeEach(() => {
  vi.clearAllMocks();
  m.rateLimited = false;
  m.recordFailedLoginAttempt.mockResolvedValue({ locked: false, remainingAttempts: 4 });
});

describe('an account with a password re-enters it to disconnect a provider', () => {
  beforeEach(() => {
    m.session = { user: { id: 'owner' }, authTime: minutesAgo(1), authProvider: 'google' };
    m.user = {
      id: 'owner',
      email: 'owner@example.com',
      password: HASH,
      password_changed_at: null,
      accounts: [account('github'), account('google')],
    };
  });

  it('refuses without the current password, even right after a provider sign-in', async () => {
    const result = await removeConnectedAccount('github');

    expect(result.success).toBe(false);
    expect((result as { code?: string }).code).toBe('PASSWORD_REQUIRED');
    expect(m.deleted).not.toHaveBeenCalled();
  });

  it('refuses a wrong password and counts it toward the lockout', async () => {
    const result = await removeConnectedAccount('github', { currentPassword: 'wrong-guess-1' });

    expect(result.success).toBe(false);
    expect((result as { code?: string }).code).toBe('INCORRECT_PASSWORD');
    expect(m.recordFailedLoginAttempt).toHaveBeenCalledWith('owner@example.com', expect.any(String), expect.any(String));
    expect(m.deleted).not.toHaveBeenCalled();
  });

  it('refuses while the per-user password budget is spent', async () => {
    m.rateLimited = true;

    const result = await removeConnectedAccount('github', { currentPassword: CURRENT });

    expect((result as { code?: string }).code).toBe('RATE_LIMITED');
    expect(m.deleted).not.toHaveBeenCalled();
  });

  it('disconnects with the right password', async () => {
    const result = await removeConnectedAccount('github', { currentPassword: CURRENT });

    expect(result).toEqual({ success: true });
    expect(m.deleted).toHaveBeenCalledTimes(1);
  });

  it('can disconnect the only provider, since the password remains', async () => {
    m.user = { ...m.user!, accounts: [account('github')] };

    const result = await removeConnectedAccount('github', { currentPassword: CURRENT });

    expect(result).toEqual({ success: true });
  });
});

describe('an OAuth-only account re-authenticates through another provider it keeps', () => {
  beforeEach(() => {
    m.user = {
      id: 'owner',
      email: 'owner@example.com',
      password: null,
      password_changed_at: null,
      accounts: [account('github'), account('google')],
    };
  });

  it('refuses a stolen, hour-old session', async () => {
    m.session = { user: { id: 'owner' }, authTime: minutesAgo(60), authProvider: 'google' };

    const result = await removeConnectedAccount('github');

    expect(result.success).toBe(false);
    expect((result as { code?: string }).code).toBe('REAUTH_REQUIRED');
    expect(m.deleted).not.toHaveBeenCalled();
  });

  it('refuses a legacy session without a sign-in stamp', async () => {
    m.session = { user: { id: 'owner' } };

    const result = await removeConnectedAccount('github');

    expect((result as { code?: string }).code).toBe('REAUTH_REQUIRED');
    expect(m.deleted).not.toHaveBeenCalled();
  });

  it('does not accept a fresh sign-in through the provider being removed', async () => {
    m.session = { user: { id: 'owner' }, authTime: minutesAgo(1), authProvider: 'github' };

    const result = await removeConnectedAccount('github');

    expect((result as { code?: string }).code).toBe('REAUTH_REQUIRED');
    expect(m.deleted).not.toHaveBeenCalled();
  });

  it('disconnects right after a sign-in through another linked provider', async () => {
    m.session = { user: { id: 'owner' }, authTime: minutesAgo(1), authProvider: 'google' };

    const result = await removeConnectedAccount('github');

    expect(result).toEqual({ success: true });
    expect(m.deleted).toHaveBeenCalledTimes(1);
  });
});

describe('an account always keeps a way to sign in', () => {
  it('refuses to remove the only provider of an OAuth-only account', async () => {
    m.session = { user: { id: 'owner' }, authTime: minutesAgo(1), authProvider: 'github' };
    m.user = { id: 'owner', email: 'o@example.com', password: null, password_changed_at: null, accounts: [account('github')] };

    const result = await removeConnectedAccount('github');

    expect((result as { code?: string }).code).toBe('LAST_LOGIN_METHOD');
    expect(m.deleted).not.toHaveBeenCalled();
  });

  it('counts providers, not rows: two GitHub logins are still one provider to remove', async () => {
    m.session = { user: { id: 'owner' }, authTime: minutesAgo(1), authProvider: 'github' };
    m.user = {
      id: 'owner',
      email: 'o@example.com',
      password: null,
      password_changed_at: null,
      accounts: [account('github', 'gh-1'), account('github', 'gh-2')],
    };

    const result = await removeConnectedAccount('github');

    expect((result as { code?: string }).code).toBe('LAST_LOGIN_METHOD');
    expect(m.deleted).not.toHaveBeenCalled();
  });

  it('refuses a provider that is not connected', async () => {
    m.session = { user: { id: 'owner' }, authTime: minutesAgo(1), authProvider: 'github' };
    m.user = { id: 'owner', email: 'o@example.com', password: HASH, password_changed_at: null, accounts: [account('github')] };

    const result = await removeConnectedAccount('twitter', { currentPassword: CURRENT });

    expect((result as { code?: string }).code).toBe('NOT_CONNECTED');
    expect(m.deleted).not.toHaveBeenCalled();
  });

  it('still requires a session', async () => {
    m.session = null;

    const result = await removeConnectedAccount('github', { currentPassword: CURRENT });

    expect(result.success).toBe(false);
    expect(m.deleted).not.toHaveBeenCalled();
  });

  it('validates its input', async () => {
    m.session = { user: { id: 'owner' } };

    const result = await removeConnectedAccount(42 as unknown as string);

    expect(result.success).toBe(false);
    expect(m.deleted).not.toHaveBeenCalled();
  });
});

describe('hasRecentReauthentication (the rule for linking a new provider)', () => {
  const account = { linkedProviders: ['github'], hasPassword: true, passwordChangedAt: null };

  it('accepts a fresh sign-in through a linked provider or with the password', () => {
    expect(hasRecentReauthentication({ authTime: minutesAgo(1), authProvider: 'github' }, account)).toBe(true);
    expect(hasRecentReauthentication({ authTime: minutesAgo(1), authProvider: 'credentials' }, account)).toBe(true);
  });

  it('refuses stale, legacy, unlinked-provider and passwordless-credentials stamps', () => {
    expect(hasRecentReauthentication({ authTime: minutesAgo(6), authProvider: 'github' }, account)).toBe(false);
    expect(hasRecentReauthentication({}, account)).toBe(false);
    expect(hasRecentReauthentication({ authTime: minutesAgo(1), authProvider: 'google' }, account)).toBe(false);
    expect(
      hasRecentReauthentication({ authTime: minutesAgo(1), authProvider: 'credentials' }, { ...account, hasPassword: false })
    ).toBe(false);
  });

  it('refuses a sign-in that a later password change revoked', () => {
    expect(
      hasRecentReauthentication(
        { authTime: minutesAgo(2), authProvider: 'github' },
        { ...account, passwordChangedAt: new Date(minutesAgo(1)) }
      )
    ).toBe(false);
  });

  it('reports when a re-authentication stops counting', () => {
    const now = Date.now();
    const authTime = now - 60_000;
    expect(reauthenticatedUntil({ authTime, authProvider: 'github' }, account, now)).toBe(authTime + 5 * 60_000);
    expect(reauthenticatedUntil({ authTime: now - 10 * 60_000, authProvider: 'github' }, account, now)).toBeNull();
  });
});
