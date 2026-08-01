import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Claiming a grant and issuing against it must be one unit.
 *
 * issueTokenPair was already transactional and its comment named the hazard —
 * "a state they cannot recover from without starting the whole flow again" —
 * but the boundary sat one level too narrow. The claim that authorises the
 * issuance was outside it, so a failure during issuance spent the code and
 * produced nothing. The client cannot retry, because a second redemption is
 * correctly refused as reuse.
 *
 * On the rotation path the same gap is worse: the retry looks like refresh
 * token reuse, so a transient database error revokes the entire family.
 *
 * These tests pin the boundary, not the row counts — every write must be issued
 * on the transaction handle, and a failure must roll back rather than report.
 */

const { writes, mockDb } = vi.hoisted(() => ({
  writes: [] as string[],
  mockDb: { transaction: vi.fn(), update: vi.fn(), insert: vi.fn(), select: vi.fn() },
}));

vi.mock('@/db', () => ({ db: mockDb }));
vi.mock('@/lib/oauth/provider/tokens', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/oauth/provider/tokens')>();
  return { ...actual };
});

import { db } from '@/db';
import { redeemAuthorizationCode } from '@/lib/oauth/provider/grants';

const CLIENT_UUID = '11111111-1111-1111-1111-111111111111';

function codeRow() {
  return {
    uuid: '22222222-2222-2222-2222-222222222222',
    code_hash: 'hash',
    client_uuid: CLIENT_UUID,
    user_id: 'user-1',
    granted_project_uuids: ['hub-1'],
    scopes: ['library:read'],
    redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
    code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    code_challenge_method: 'S256',
    consumed_at: null,
    expires_at: new Date(Date.now() + 60_000),
  };
}

/**
 * The bare `db` handle records any write that reaches it, which is how a write
 * escaping the transaction becomes visible rather than silently passing.
 */
function transactionalDb(options: { failOnRefreshInsert?: boolean } = {}) {
  let inserts = 0;
  const tx = {
    update: vi.fn(() => {
      writes.push('tx:claim');
      return {
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([codeRow()]) })),
        })),
      };
    }),
    insert: vi.fn(() => {
      inserts += 1;
      const isRefresh = inserts === 2;
      writes.push(isRefresh ? 'tx:refresh-token' : 'tx:access-token');
      return {
        values: vi.fn(() =>
          isRefresh && options.failOnRefreshInsert
            ? Promise.reject(new Error('insert failed'))
            : Promise.resolve([])
        ),
      };
    }),
  };

  (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(
    (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)
  );
  for (const method of ['update', 'insert'] as const) {
    (db[method] as ReturnType<typeof vi.fn>).mockImplementation(() => {
      writes.push(`db:${method}-outside-transaction`);
      throw new Error(`${method} issued outside the transaction`);
    });
  }
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([codeRow()]) })) })),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  writes.length = 0;
});

describe('redeemAuthorizationCode', () => {
  const input = {
    code: 'the-code',
    clientUuid: CLIENT_UUID,
    redirectUri: 'https://claude.ai/api/mcp/auth_callback',
    codeVerifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
  };

  it('claims the code and issues the tokens on one transaction', async () => {
    transactionalDb();

    const result = await redeemAuthorizationCode(input);

    expect(result.ok).toBe(true);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(writes).toEqual(['tx:claim', 'tx:access-token', 'tx:refresh-token']);
  });

  it('does not spend the code when issuance fails', async () => {
    // Without the shared transaction this call resolved with the code consumed
    // and no tokens written — unrecoverable, since retrying reads as reuse.
    transactionalDb({ failOnRefreshInsert: true });

    await expect(redeemAuthorizationCode(input)).rejects.toThrow('insert failed');
    expect(writes).not.toContain('db:update-outside-transaction');
    expect(writes).not.toContain('db:insert-outside-transaction');
    // The claim rode the same transaction, so the rollback takes it with it.
    expect(writes[0]).toBe('tx:claim');
  });
});
