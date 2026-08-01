import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A refresh token presented by a client it was not issued to.
 *
 * This used to return 'Token was issued to another client' and stop there,
 * before reuse detection ran, so the family survived. Two things followed.
 * The holder of a stolen token could confirm it was live without tripping the
 * control that exists to contain a leak — and then pick their moment, since
 * client_id is public and the correct one is always available. And the distinct
 * wording separated "no such token" from "real token, wrong client", which is
 * an oracle for testing stolen tokens.
 *
 * Presentation by the wrong client is not a validation failure. It is the
 * clearest evidence available that the token has left its holder, so it is
 * treated as a compromise and revokes the family.
 */

const { revoked, mockDb } = vi.hoisted(() => ({
  revoked: [] as { family: string; reason: string }[],
  mockDb: { select: vi.fn(), transaction: vi.fn(), update: vi.fn() },
}));

vi.mock('@/db', () => ({ db: mockDb }));

import { db } from '@/db';
import { rotateRefreshToken } from '@/lib/oauth/provider/grants';

const OWNER_CLIENT = '11111111-1111-1111-1111-111111111111';
const OTHER_CLIENT = '22222222-2222-2222-2222-222222222222';
const FAMILY = '33333333-3333-3333-3333-333333333333';

function storedToken(overrides: Record<string, unknown> = {}) {
  return {
    uuid: '44444444-4444-4444-4444-444444444444',
    family_id: FAMILY,
    client_uuid: OWNER_CLIENT,
    user_id: 'user-1',
    granted_project_uuids: ['hub-1'],
    scopes: ['library:read'],
    rotated_at: null,
    revoked_at: null,
    expires_at: new Date(Date.now() + 86_400_000),
    ...overrides,
  };
}

function dbReturning(rows: Record<string, unknown>[]) {
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) })) })),
  });

  const tx = {
    update: vi.fn((table: { _?: { name?: string } }) => ({
      set: vi.fn((payload: Record<string, unknown>) => ({
        where: vi.fn(() => {
          if (payload.revocation_reason) {
            revoked.push({ family: FAMILY, reason: String(payload.revocation_reason) });
          }
          const result = Promise.resolve({ rowCount: 1 }) as Promise<unknown> & {
            returning: () => Promise<unknown[]>;
          };
          result.returning = () => Promise.resolve([{ uuid: 'row' }]);
          return result;
        }),
      })),
      _table: table,
    })),
    // The success path issues a token pair on the same transaction.
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
  };
  (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(
    (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  revoked.length = 0;
});

describe('rotateRefreshToken with a mismatched client', () => {
  it('revokes the family instead of merely rejecting', async () => {
    dbReturning([storedToken()]);

    const result = await rotateRefreshToken({
      refreshToken: 'stolen-token',
      clientUuid: OTHER_CLIENT,
    });

    expect(result.ok).toBe(false);
    expect(revoked).toEqual([{ family: FAMILY, reason: 'refresh_token_wrong_client' }]);
  });

  it('answers a wrong-client token exactly as it answers an unknown one', async () => {
    // Distinct wording would let a holder of stolen tokens sort the live ones
    // from the invented ones without ever redeeming any.
    dbReturning([storedToken()]);
    const wrongClient = await rotateRefreshToken({
      refreshToken: 'stolen-token',
      clientUuid: OTHER_CLIENT,
    });

    dbReturning([]);
    const unknown = await rotateRefreshToken({
      refreshToken: 'never-existed',
      clientUuid: OTHER_CLIENT,
    });

    expect(wrongClient).toEqual(unknown);
  });

  it('leaves the family alone when the right client presents a live token', async () => {
    // The revocation must key on the mismatch, not fire on every rotation.
    dbReturning([storedToken()]);

    const result = await rotateRefreshToken({
      refreshToken: 'legitimate-token',
      clientUuid: OWNER_CLIENT,
    });

    expect(result.ok).toBe(true);
    expect(revoked).toHaveLength(0);
  });
});
