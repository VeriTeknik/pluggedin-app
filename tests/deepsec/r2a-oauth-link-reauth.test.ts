// @vitest-environment node
/**
 * A session could attach its holder's own OAuth account to the account it
 * belongs to.
 *
 * NextAuth links a provider account to whoever the CURRENT session belongs to
 * (next-auth core/lib/callback-handler.js): a session cookie plus a provider
 * account nobody has linked yet means linkAccount({ ...account, userId:
 * sessionUser }). The signIn callback returned true for it, and the JWT callback
 * then stamped authTime=now / authProvider=<that provider>. So with a stolen
 * session an attacker could "Sign in with GitHub" using their own GitHub account
 * and get (1) a permanent login into the victim's account and (2) a fresh
 * "provider sign-in" that satisfied the re-authentication check guarding
 * setPassword.
 *
 * Now the signIn callback refuses to let a session link a NEW provider account
 * unless that session itself re-authenticated in the last five minutes (via a
 * provider that was already linked, or with the account's password). Signing
 * in again with an account that is already linked — the re-authentication step
 * itself — is unaffected, as are sign-ins without a session.
 *
 * These tests run the real signIn and jwt callbacks and NextAuth's real
 * callbackHandler against an in-memory users/accounts store.
 */
import { createRequire } from 'node:module';
import path from 'node:path';

import { decode, encode, type JWT } from 'next-auth/jwt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  password: string | null;
  password_changed_at: Date | null;
};
type AccountRow = { userId: string; provider: string; providerAccountId: string; type: string };

const m = vi.hoisted(() => {
  process.env.NEXTAUTH_URL = 'http://localhost:12005';
  return {
    users: [] as UserRow[],
    accounts: [] as AccountRow[],
    cookies: [] as Array<{ name: string; value: string }>,
  };
});

vi.mock('@auth/drizzle-adapter', () => ({ DrizzleAdapter: () => ({}) }));
vi.mock('@/lib/admin-notifications', () => ({ notifyAdminsOfNewUser: vi.fn() }));
vi.mock('@/lib/welcome-emails', () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock('@/lib/default-project-creation', () => ({ createDefaultProject: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => m.cookies }),
  headers: async () => new Headers(),
}));
vi.mock('@/db', () => {
  // Enough of drizzle's relational query API for callback-style `where`s.
  const ops = { eq: (a: unknown, b: unknown) => a === b, and: (...c: boolean[]) => c.every(Boolean) };
  type Args = { where?: unknown; with?: { accounts?: unknown } };
  const matches = (args: Args) => (row: Record<string, unknown>) =>
    typeof args.where === 'function' ? Boolean(args.where(row, ops)) : true;
  return {
    db: {
      query: {
        users: {
          findFirst: async (args: Args) => {
            const row = m.users.find(matches(args));
            if (!row) return undefined;
            return args.with?.accounts
              ? { ...row, accounts: m.accounts.filter((a) => a.userId === row.id) }
              : row;
          },
        },
        accounts: { findFirst: async (args: Args) => m.accounts.find(matches(args)) },
      },
      update: () => ({ set: () => ({ where: async () => undefined }) }),
      insert: () => ({
        values: async (row: AccountRow) => {
          m.accounts.push({
            userId: row.userId,
            provider: row.provider,
            providerAccountId: row.providerAccountId,
            type: row.type,
          });
        },
      }),
    },
  };
});

import type { Account } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { hasRecentOAuthSignIn } from '@/lib/credential-reverification';

// NextAuth's own linking logic; not in the package's export map.
const callbackHandler = createRequire(import.meta.url)(
  path.resolve(process.cwd(), 'node_modules/next-auth/core/lib/callback-handler.js')
).default as (params: Record<string, unknown>) => Promise<{
  user: { id: string; name?: string | null; email?: string | null; image?: string | null };
  isNewUser?: boolean;
}>;

const SECRET = authOptions.secret as string;
const SESSION_COOKIE = 'next-auth.session-token';
const minutesAgo = (n: number) => Date.now() - n * 60_000;

const adapter = {
  getUser: async (id: string) => m.users.find((u) => u.id === id) ?? null,
  getUserByEmail: async (email: string) => m.users.find((u) => u.email === email) ?? null,
  getUserByAccount: async ({ provider, providerAccountId }: { provider: string; providerAccountId: string }) => {
    const account = m.accounts.find((a) => a.provider === provider && a.providerAccountId === providerAccountId);
    return account ? (m.users.find((u) => u.id === account.userId) ?? null) : null;
  },
  createUser: vi.fn(async (data: Omit<UserRow, 'id'>) => {
    const user = { ...data, id: `new-${m.users.length}`, password: null, password_changed_at: null };
    m.users.push(user);
    return user;
  }),
  linkAccount: vi.fn(async (account: AccountRow) => {
    m.accounts.push({
      userId: account.userId,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      type: account.type,
    });
  }),
};

function oauth(provider: string, providerAccountId: string): Account {
  return { provider, providerAccountId, type: 'oauth', access_token: 'at', token_type: 'bearer' };
}

async function signedInAs(token: Record<string, unknown>) {
  const value = await encode({
    token: { name: null, email: null, picture: null, ...token } as unknown as JWT,
    secret: SECRET,
  });
  m.cookies = [{ name: SESSION_COOKIE, value }];
}

/**
 * The OAuth callback, in the order next-auth core/routes/callback.js runs it:
 * signIn callback (with the linked user, or the provider profile when nobody
 * has the account yet), then callbackHandler, then the jwt callback.
 */
async function oauthCallback(account: Account, profile: { id: string; email: string; name: string }) {
  const known = await adapter.getUserByAccount(account);
  const allowed = await authOptions.callbacks!.signIn!({
    user: (known ?? { ...profile, image: null }) as never,
    account,
    profile: profile as never,
  });
  if (allowed !== true) return { allowed };

  const sessionToken = m.cookies.find((c) => c.name === SESSION_COOKIE)?.value;
  const { user, isNewUser } = await callbackHandler({
    sessionToken,
    profile: { ...profile, image: null },
    account,
    options: {
      adapter,
      jwt: { secret: SECRET, maxAge: 60, encode, decode },
      events: {},
      session: { strategy: 'jwt', maxAge: 60 },
      provider: { id: account.provider, allowDangerousEmailAccountLinking: false },
    },
  });
  const token = await authOptions.callbacks!.jwt!({
    token: { name: user.name, email: user.email, picture: user.image, sub: user.id },
    user,
    account,
    profile,
    isNewUser,
    trigger: isNewUser ? 'signUp' : 'signIn',
  } as never);
  return { allowed, user, token };
}

const OWNER: UserRow = {
  id: 'owner',
  email: 'owner@example.com',
  name: 'Owner',
  image: null,
  password: null,
  password_changed_at: null,
};
const ATTACKER_GITHUB = { id: 'gh-attacker', email: 'attacker@evil.test', name: 'Attacker' };

beforeEach(() => {
  vi.clearAllMocks();
  m.users = [{ ...OWNER }];
  m.accounts = [{ userId: 'owner', provider: 'github', providerAccountId: 'gh-owner', type: 'oauth' }];
  m.cookies = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a session cannot attach a provider account without a recent re-authentication', () => {
  it("refuses to link the attacker's GitHub account to a stolen, hour-old session", async () => {
    await signedInAs({ sub: 'owner', id: 'owner', authTime: minutesAgo(60), authProvider: 'github' });

    const result = await oauthCallback(oauth('github', ATTACKER_GITHUB.id), ATTACKER_GITHUB);

    expect(result.allowed).toMatch(/^\/settings\?linkError=reauth_required/);
    expect(adapter.linkAccount).not.toHaveBeenCalled();
    expect(m.accounts).toEqual([
      { userId: 'owner', provider: 'github', providerAccountId: 'gh-owner', type: 'oauth' },
    ]);
  });

  it('so the stolen session never gains the fresh provider sign-in that setPassword accepts', async () => {
    await signedInAs({ sub: 'owner', id: 'owner', authTime: minutesAgo(60), authProvider: 'github' });

    const result = await oauthCallback(oauth('google', 'g-attacker'), { ...ATTACKER_GITHUB, id: 'g-attacker' });

    expect(result.allowed).not.toBe(true);
    expect(result.token).toBeUndefined();
    const owners = m.accounts.filter((a) => a.userId === 'owner');
    expect(hasRecentOAuthSignIn({ authTime: minutesAgo(60), authProvider: 'github' }, owners)).toBe(false);
  });

  it('refuses a legacy session that carries no sign-in stamp', async () => {
    await signedInAs({ sub: 'owner', id: 'owner' });

    const result = await oauthCallback(oauth('github', ATTACKER_GITHUB.id), ATTACKER_GITHUB);

    expect(result.allowed).not.toBe(true);
    expect(adapter.linkAccount).not.toHaveBeenCalled();
  });

  it('refuses a session whose sign-in predates a password change (revocation pending)', async () => {
    m.users[0].password_changed_at = new Date(minutesAgo(1));
    await signedInAs({ sub: 'owner', id: 'owner', authTime: minutesAgo(2), authProvider: 'github' });

    const result = await oauthCallback(oauth('github', ATTACKER_GITHUB.id), ATTACKER_GITHUB);

    expect(result.allowed).not.toBe(true);
    expect(adapter.linkAccount).not.toHaveBeenCalled();
  });

  it('refuses a fresh stamp from a provider that is no longer linked', async () => {
    await signedInAs({ sub: 'owner', id: 'owner', authTime: minutesAgo(1), authProvider: 'twitter' });

    const result = await oauthCallback(oauth('github', ATTACKER_GITHUB.id), ATTACKER_GITHUB);

    expect(result.allowed).not.toBe(true);
    expect(adapter.linkAccount).not.toHaveBeenCalled();
  });

  it('refuses a fresh password sign-in once the account no longer has a password', async () => {
    await signedInAs({ sub: 'owner', id: 'owner', authTime: minutesAgo(1), authProvider: 'credentials' });

    const result = await oauthCallback(oauth('github', ATTACKER_GITHUB.id), ATTACKER_GITHUB);

    expect(result.allowed).not.toBe(true);
    expect(adapter.linkAccount).not.toHaveBeenCalled();
  });

  it('keys the check on the token subject, which is whom NextAuth would link to', async () => {
    // The JWT callback drops `id` from a revoked token but leaves `sub`, and
    // callbackHandler links to `sub`.
    await signedInAs({ sub: 'owner', authTime: minutesAgo(60), authProvider: 'github' });

    const result = await oauthCallback(oauth('github', ATTACKER_GITHUB.id), ATTACKER_GITHUB);

    expect(result.allowed).not.toBe(true);
    expect(adapter.linkAccount).not.toHaveBeenCalled();
  });
});

describe('sign-ins that link nothing are unaffected', () => {
  it('lets a session sign in again with an account it already has (the re-auth step)', async () => {
    await signedInAs({ sub: 'owner', id: 'owner', authTime: minutesAgo(60), authProvider: 'github' });
    const before = Date.now();

    const result = await oauthCallback(oauth('github', 'gh-owner'), { id: 'gh-owner', email: OWNER.email, name: 'Owner' });

    expect(result.allowed).toBe(true);
    expect(adapter.linkAccount).not.toHaveBeenCalled();
    expect(result.token?.authProvider).toBe('github');
    expect(result.token?.authTime).toBeGreaterThanOrEqual(before);
  });

  it('lets someone without a session sign up with a new provider account', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });

    const result = await oauthCallback(oauth('github', 'gh-newcomer'), {
      id: 'gh-newcomer',
      email: 'newcomer@example.com',
      name: 'Newcomer',
    });

    expect(result.allowed).toBe(true);
    expect(adapter.linkAccount).toHaveBeenCalledWith(expect.objectContaining({ userId: result.user?.id }));
    expect(result.user?.id).not.toBe('owner');
  });

  it('treats a session cookie it cannot decode as no session, as NextAuth does', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    m.cookies = [{ name: SESSION_COOKIE, value: 'not-a-jwt' }];

    const result = await oauthCallback(oauth('github', 'gh-newcomer'), {
      id: 'gh-newcomer',
      email: 'newcomer@example.com',
      name: 'Newcomer',
    });

    expect(result.allowed).toBe(true);
    expect(result.user?.id).not.toBe('owner');
  });
});

describe('a legitimate link after a fresh re-authentication still works', () => {
  it('links Google right after the owner re-authenticated with GitHub', async () => {
    await signedInAs({ sub: 'owner', id: 'owner', authTime: minutesAgo(1), authProvider: 'github' });

    const result = await oauthCallback(oauth('google', 'g-owner'), { id: 'g-owner', email: 'owner.alt@example.com', name: 'Owner' });

    expect(result.allowed).toBe(true);
    expect(adapter.linkAccount).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google', userId: 'owner' }));
    expect(m.accounts).toContainEqual(expect.objectContaining({ provider: 'google', providerAccountId: 'g-owner', userId: 'owner' }));
    expect(result.user?.id).toBe('owner');
  });

  it('links right after a password sign-in on an account that has a password', async () => {
    m.users[0].password = 'bcrypt-hash';
    m.users[0].password_changed_at = new Date(minutesAgo(60 * 24));
    await signedInAs({ sub: 'owner', id: 'owner', authTime: minutesAgo(1), authProvider: 'credentials' });

    const result = await oauthCallback(oauth('google', 'g-owner'), { id: 'g-owner', email: 'owner.alt@example.com', name: 'Owner' });

    expect(result.allowed).toBe(true);
    expect(m.accounts).toContainEqual(expect.objectContaining({ provider: 'google', userId: 'owner' }));
  });

  it('links a provider account whose email matches the owner (the signIn callback links it itself)', async () => {
    await signedInAs({ sub: 'owner', id: 'owner', authTime: minutesAgo(1), authProvider: 'github' });

    const result = await oauthCallback(oauth('google', 'g-owner'), { id: 'g-owner', email: OWNER.email, name: 'Owner' });

    expect(result.allowed).toBe(true);
    expect(m.accounts).toContainEqual(expect.objectContaining({ provider: 'google', providerAccountId: 'g-owner', userId: 'owner' }));
  });
});
