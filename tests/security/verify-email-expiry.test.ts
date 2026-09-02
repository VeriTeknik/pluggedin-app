import { beforeEach, describe, expect, it, vi } from 'vitest';

const tokenFindFirst = vi.fn();
const set = vi.fn(() => ({ where: vi.fn(async () => undefined) }));
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

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * app/api/auth/verify-email checks `expires` before accepting a token. This
 * second path — a server action, so equally a public endpoint — did not check
 * it at all, which made the 24-hour lifetime decorative: any token ever issued
 * for an address kept verifying it.
 */
describe('verifyEmail honours the token expiry', () => {
  it('refuses an expired token', async () => {
    tokenFindFirst.mockResolvedValue({
      identifier: 'someone@example.com',
      token: 'stale',
      expires: new Date(Date.now() - 60_000),
    });

    await expect(verifyEmail('stale')).rejects.toThrow(/expired/i);
    expect(update).not.toHaveBeenCalled();
  });

  it('accepts a token that is still live', async () => {
    tokenFindFirst.mockResolvedValue({
      identifier: 'someone@example.com',
      token: 'fresh',
      expires: new Date(Date.now() + 60_000),
    });

    await expect(verifyEmail('fresh')).resolves.toEqual({ success: true });
    expect(update).toHaveBeenCalled();
  });
});
