/**
 * Re-authentication was read from accounts.last_used — the time the account
 * last signed in with a provider on ANY device. A stolen session could ride on
 * the owner signing in elsewhere: within five minutes of that, the attacker's
 * copy of an old session passed the "fresh sign-in" check and could set a
 * password (settings action, /api/settings/password/set).
 *
 * Now the JWT carries its own sign-in stamp (authTime + authProvider), written
 * once when that session signs in and never on refresh, and the re-auth check
 * reads the CURRENT session's stamp. Tokens issued before the stamp existed
 * have none and count as not recent.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  user: vi.fn(),
  session: null as null | Record<string, unknown>,
  dbUser: null as null | Record<string, unknown>,
  set: vi.fn(),
}));

vi.mock('@auth/drizzle-adapter', () => ({ DrizzleAdapter: () => ({}) }));
vi.mock('@/lib/admin-notifications', () => ({ notifyAdminsOfNewUser: vi.fn() }));
vi.mock('@/lib/welcome-emails', () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock('@/lib/default-project-creation', () => ({ createDefaultProject: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/email', () => ({
  generatePasswordRemovedEmail: vi.fn(() => ({})),
  generatePasswordSetEmail: vi.fn(() => ({})),
  sendEmail: vi.fn(async () => true),
}));
vi.mock('@/lib/auth-security', () => ({
  clearFailedLoginAttempts: vi.fn(),
  isAccountLocked: vi.fn(),
  recordFailedLoginAttempt: vi.fn(),
  isPasswordComplex: () => ({ isValid: true, errors: [] }),
  recordPasswordChange: vi.fn(async () => undefined),
}));
vi.mock('next-auth/next', () => ({ getServerSession: async () => m.session }));
vi.mock('@/db', () => ({
  db: {
    query: {
      users: {
        findFirst: async (args: { columns?: unknown }) => (args?.columns ? m.user() : m.dbUser),
      },
    },
    update: () => ({ set: (values: unknown) => (m.set(values), { where: async () => undefined }) }),
  },
}));

import { authOptions } from '@/lib/auth';
import { hasRecentOAuthSignIn, OAUTH_REAUTH_WINDOW_MS } from '@/lib/credential-reverification';

const jwt = (params: Record<string, unknown>) => authOptions.callbacks!.jwt!(params as never);
const minutesAgo = (n: number) => Date.now() - n * 60_000;

beforeEach(() => {
  vi.clearAllMocks();
  m.user.mockResolvedValue({ id: 'owner', username: 'owner', is_admin: false, password_changed_at: null });
});

describe('the JWT records when and how this session signed in', () => {
  it('stamps authTime and authProvider at sign-in', async () => {
    const before = Date.now();
    const token = await jwt({
      token: {},
      user: { id: 'owner', name: 'Owner', email: 'owner@example.com' },
      account: { provider: 'github', type: 'oauth', providerAccountId: '42' },
      trigger: 'signIn',
    });

    expect(token.authTime).toBeGreaterThanOrEqual(before);
    expect(token.authTime).toBeLessThanOrEqual(Date.now());
    expect(token.authProvider).toBe('github');
  });

  it('does not move the stamp when the session is refreshed', async () => {
    const signedIn = minutesAgo(60);
    const token = await jwt({
      token: { id: 'owner', username: 'owner', is_admin: false, passwordChangedAt: null, userValidationTs: 0, authTime: signedIn, authProvider: 'github' },
    });

    expect(token.authTime).toBe(signedIn);
    expect(token.authProvider).toBe('github');
  });

  it('does not invent a stamp for a legacy token', async () => {
    const token = await jwt({ token: { id: 'owner', userValidationTs: 0 } });

    expect(token.authTime).toBeUndefined();
    expect(token.authProvider).toBeUndefined();
  });

  it('ignores a client-supplied stamp on session update', async () => {
    const signedIn = minutesAgo(60);
    const token = await jwt({
      token: { id: 'owner', username: 'owner', is_admin: false, passwordChangedAt: null, userValidationTs: Date.now(), authTime: signedIn, authProvider: 'github' },
      trigger: 'update',
      session: { username: 'owner', authTime: Date.now(), authProvider: 'google' },
    });

    expect(token.authTime).toBe(signedIn);
    expect(token.authProvider).toBe('github');
  });

  it('exposes the stamp on the session', async () => {
    const session = await authOptions.callbacks!.session!({
      session: { user: {}, expires: '' },
      token: { id: 'owner', name: null, email: null, username: null, authTime: 1234, authProvider: 'github' },
    } as never);

    expect(session).toMatchObject({ authTime: 1234, authProvider: 'github' });
  });
});

describe('hasRecentOAuthSignIn reads the current session, not the account', () => {
  const github = [{ provider: 'github', last_used: new Date() }];

  it('accepts a session that signed in through a linked provider moments ago', () => {
    expect(hasRecentOAuthSignIn({ authTime: minutesAgo(1), authProvider: 'github' }, github)).toBe(true);
  });

  it("refuses an old session even though the account signed in elsewhere just now", () => {
    expect(hasRecentOAuthSignIn({ authTime: minutesAgo(60), authProvider: 'github' }, github)).toBe(false);
  });

  it('refuses a legacy session without a stamp', () => {
    expect(hasRecentOAuthSignIn({}, github)).toBe(false);
    expect(hasRecentOAuthSignIn(null, github)).toBe(false);
  });

  it('refuses a session that signed in through a provider that is not linked', () => {
    expect(hasRecentOAuthSignIn({ authTime: minutesAgo(1), authProvider: 'google' }, github)).toBe(false);
    expect(hasRecentOAuthSignIn({ authTime: minutesAgo(1), authProvider: 'credentials' }, github)).toBe(false);
  });

  it('refuses a stamp outside the window or in the future', () => {
    const now = Date.now();
    expect(
      hasRecentOAuthSignIn({ authTime: now - OAUTH_REAUTH_WINDOW_MS - 1, authProvider: 'github' }, github, now)
    ).toBe(false);
    expect(hasRecentOAuthSignIn({ authTime: now + 60_000, authProvider: 'github' }, github, now)).toBe(false);
  });
});

describe('setPassword uses the current session stamp', () => {
  async function setPassword() {
    const { setPassword } = await import('@/app/(sidebar-layout)/(container)/settings/actions');
    return setPassword('Fresh-Password-1!');
  }

  beforeEach(() => {
    m.dbUser = {
      id: 'owner',
      email: 'owner@example.com',
      password: null,
      // The owner just signed in with GitHub on their own device.
      accounts: [{ provider: 'github', last_used: new Date() }],
    };
  });

  it("refuses a stolen old session riding on the owner's fresh sign-in elsewhere", async () => {
    m.session = { user: { id: 'owner' }, authTime: minutesAgo(90), authProvider: 'github' };

    const result = await setPassword();

    expect(result.success).toBe(false);
    expect((result as { code?: string }).code).toBe('REAUTH_REQUIRED');
    expect(m.set).not.toHaveBeenCalled();
  });

  it('refuses a legacy session without a stamp', async () => {
    m.session = { user: { id: 'owner' } };

    const result = await setPassword();

    expect((result as { code?: string }).code).toBe('REAUTH_REQUIRED');
    expect(m.set).not.toHaveBeenCalled();
  });

  it('sets the password for a session that just re-authenticated', async () => {
    m.session = { user: { id: 'owner' }, authTime: minutesAgo(1), authProvider: 'github' };

    const result = await setPassword();

    expect(result).toEqual({ success: true });
    expect(m.set).toHaveBeenCalledWith(expect.objectContaining({ password: expect.any(String) }));
  });
});
