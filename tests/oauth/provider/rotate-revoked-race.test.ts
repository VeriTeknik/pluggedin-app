import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Rotation must lose to a revocation that lands mid-flight.
 *
 * rotateRefreshToken reads the token, classifies it, then claims it with an
 * UPDATE. classifyRefreshFailure judges the snapshot from that first read, and
 * the claim used to require only `rotated_at IS NULL`. So a family revoked
 * between the read and the claim passed both: the revoked token was claimed and
 * a fresh pair issued from it.
 *
 * The window is not incidental. Revocation happens when reuse is detected —
 * during an attack, concurrently with the attacker's other requests — so it is
 * open at precisely the moment the control is supposed to be working.
 *
 * The claim now also requires `revoked_at IS NULL`, which makes the database
 * re-check the condition at write time instead of trusting the earlier read.
 */

const { claims, revocations, mockDb } = vi.hoisted(() => ({
  claims: [] as string[],
  revocations: [] as string[],
  mockDb: { select: vi.fn(), transaction: vi.fn(), update: vi.fn() },
}));

vi.mock('@/db', () => ({ db: mockDb }));

import { db } from '@/db';
import { rotateRefreshToken } from '@/lib/oauth/provider/grants';

const CLIENT = '11111111-1111-1111-1111-111111111111';
const FAMILY = '22222222-2222-2222-2222-222222222222';
const TOKEN_UUID = '33333333-3333-3333-3333-333333333333';

function storedToken(overrides: Record<string, unknown> = {}) {
  return {
    uuid: TOKEN_UUID,
    family_id: FAMILY,
    client_uuid: CLIENT,
    user_id: 'user-1',
    granted_project_uuids: ['hub-1'],
    scopes: ['library:read'],
    rotated_at: null,
    revoked_at: null,
    expires_at: new Date(Date.now() + 86_400_000),
    ...overrides,
  };
}

/**
 * drizzle nests an and() as SQL objects whose queryChunks hold further chunks,
 * so the columns a condition names are only reachable by walking the tree.
 * Reading them is how these tests assert on the SQL the claim actually states
 * rather than on the mock's own behaviour.
 */
function columnsIn(chunks: unknown, depth = 0): string[] {
  if (depth > 6 || chunks == null) return [];
  if (Array.isArray(chunks)) return chunks.flatMap((c) => columnsIn(c, depth + 1));
  if (typeof chunks !== 'object') return [];
  const node = chunks as { name?: unknown; queryChunks?: unknown };
  return [
    ...(typeof node.name === 'string' ? [node.name] : []),
    ...columnsIn(node.queryChunks, depth + 1),
  ];
}

/**
 * `initialRead` is what the caller saw before the transaction opened;
 * `rowNow` is the state the database actually holds when the claim runs. The
 * gap between them is the race.
 */
function dbWithRace(initialRead: Record<string, unknown>, rowNow: Record<string, unknown>) {
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([initialRead]) })),
    })),
  });

  const tx = {
    update: vi.fn(() => ({
      set: vi.fn((payload: Record<string, unknown>) => ({
        where: vi.fn((condition: { queryChunks?: unknown[] }) => {
          if (payload.revocation_reason) revocations.push(String(payload.revocation_reason));

          // The claim is the update that sets rotated_at. It succeeds only if
          // the row as it stands now satisfies every condition the SQL states.
          let rows: unknown[] = [{ uuid: TOKEN_UUID }];
          if (payload.rotated_at) {
            const columns = columnsIn(condition?.queryChunks);
            claims.push(columns.join('+'));
            const blocked =
              (columns.includes('rotated_at') && rowNow.rotated_at) ||
              (columns.includes('revoked_at') && rowNow.revoked_at);
            rows = blocked ? [] : [{ uuid: TOKEN_UUID }];
          }

          const result = Promise.resolve({ rowCount: rows.length }) as Promise<unknown> & {
            returning: () => Promise<unknown[]>;
          };
          result.returning = () => Promise.resolve(rows);
          return result;
        }),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([rowNow]) })) })),
    })),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
  };

  (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(
    (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  claims.length = 0;
  revocations.length = 0;
});

describe('rotateRefreshToken racing a revocation', () => {
  const input = { refreshToken: 'a-token', clientUuid: CLIENT };

  it('refuses a token revoked between the read and the claim', async () => {
    // Read as live, revoked before the claim ran.
    dbWithRace(storedToken(), storedToken({ revoked_at: new Date() }));

    const result = await rotateRefreshToken(input);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.description).toBe('Refresh token revoked');
  });

  it('claims on revoked_at as well as rotated_at', async () => {
    dbWithRace(storedToken(), storedToken());

    await rotateRefreshToken(input);

    // Without revoked_at in the condition the database has no way to reject a
    // revocation that landed after the caller's read.
    expect(claims[0]).toContain('revoked_at');
    expect(claims[0]).toContain('rotated_at');
  });

  it('does not overwrite the original revocation reason', async () => {
    // Re-revoking would replace the reason that recorded why the family died.
    dbWithRace(storedToken(), storedToken({ revoked_at: new Date() }));

    await rotateRefreshToken(input);

    expect(revocations).toHaveLength(0);
  });

  it('still treats a lost claim on a live row as reuse', async () => {
    // Claim lost because the token was already rotated — the genuine reuse
    // signal, which must keep revoking.
    dbWithRace(storedToken(), storedToken({ rotated_at: new Date() }));

    const result = await rotateRefreshToken(input);

    expect(result.ok).toBe(false);
    expect(revocations).toContain('refresh_token_reuse_detected');
  });

  it('rotates normally when nothing raced it', async () => {
    dbWithRace(storedToken(), storedToken());

    const result = await rotateRefreshToken(input);

    expect(result.ok).toBe(true);
    expect(revocations).toHaveLength(0);
  });
});
