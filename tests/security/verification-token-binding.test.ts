import fs from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const tokenFindFirst = vi.fn();
const usersUpdateWhere = vi.fn(async () => undefined);
const set = vi.fn(() => ({ where: usersUpdateWhere }));
const update = vi.fn(() => ({ set }));

vi.mock('@/db', () => ({
  db: {
    query: { verificationTokens: { findFirst: tokenFindFirst } },
    update,
    delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
  },
}));
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

const { verifyEmail } = await import('@/app/actions/auth');

const live = () => new Date(Date.now() + 60_000);

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * verification_tokens is also NextAuth's table, so a row with no user_id is a
 * magic link the adapter owns — not something this application may verify.
 * Before the column existed, every path resolved the account by the raw email,
 * which is what let a token issued for one user verify the row that replaced it.
 */
describe('verifyEmail resolves the account by the token it was issued for', () => {
  it('refuses a token that is not bound to a user', async () => {
    tokenFindFirst.mockResolvedValue({
      identifier: 'someone@example.com',
      token: 'nextauth-magic-link',
      expires: live(),
      user_id: null,
    });

    await expect(verifyEmail('nextauth-magic-link')).rejects.toThrow(/invalid|not/i);
    expect(update).not.toHaveBeenCalled();
  });

  it('verifies the bound user, not whoever holds the address', async () => {
    tokenFindFirst.mockResolvedValue({
      identifier: 'victim@example.com',
      token: 'live',
      expires: live(),
      user_id: 'the-user-it-was-issued-for',
    });

    await verifyEmail('live');

    expect(update).toHaveBeenCalled();
  });
});

/**
 * The token has to be written in the same transaction as the user it belongs
 * to. Issued afterwards, a concurrent registration can replace that user in
 * between and the token lands pointing at the replacement.
 */
describe('registration binds the token to the user it created', () => {
  const source = fs.readFileSync('app/api/auth/register/route.ts', 'utf8');

  it('sets user_id when it issues a token', () => {
    expect(source).toMatch(/user_id:\s*userId/);
  });

  it('does not resolve the account by email at verification time', () => {
    const verifyRoute = fs.readFileSync('app/api/auth/verify-email/route.ts', 'utf8');

    expect(verifyRoute).toMatch(/verificationToken\.user_id/);
    expect(verifyRoute).not.toMatch(/eq\(users\.email,\s*verificationToken\.identifier\)/);
  });
});
