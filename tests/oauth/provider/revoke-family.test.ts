import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * revokeFamily had no test at all, which is how it shipped doing two sequential
 * updates outside a transaction — while its own docstring explained that
 * revoking the refresh chain without the access tokens is the exact state to
 * avoid. A failure on the second update produced that state and still reported
 * a revoked count, so the caller could not tell.
 *
 * These tests pin the atomicity rather than the row counts: both updates must
 * run against the transaction handle, and a failure must propagate instead of
 * being reported as a partial success.
 */

const { handles, mockDb } = vi.hoisted(() => {
  const handles: string[] = [];
  return { handles, mockDb: { transaction: vi.fn(), update: vi.fn() } };
});

vi.mock('@/db', () => ({ db: mockDb }));

import { db } from '@/db';
import { revokeFamily } from '@/lib/oauth/provider/grants';

const FAMILY = '11111111-1111-1111-1111-111111111111';

/**
 * Records which handle each update was issued on. `db.update` is left as a
 * mock that throws, so an update escaping the transaction is a failure rather
 * than something the test has to notice.
 */
function transactionalDb(options: { failOnAccessTokens?: boolean } = {}) {
  let call = 0;
  const tx = {
    update: vi.fn(() => {
      call += 1;
      const isSecond = call === 2;
      handles.push(isSecond ? 'tx:access' : 'tx:refresh');
      return {
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(() => {
              if (isSecond && options.failOnAccessTokens) {
                return Promise.reject(new Error('connection lost'));
              }
              return Promise.resolve([{ uuid: 'row' }]);
            }),
          })),
        })),
      };
    }),
  };

  (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(
    (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)
  );
  (db.update as ReturnType<typeof vi.fn>).mockImplementation(() => {
    handles.push('db:outside-transaction');
    throw new Error('update issued outside the transaction');
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  handles.length = 0;
});

describe('revokeFamily', () => {
  it('revokes refresh and access tokens inside one transaction', async () => {
    transactionalDb();

    const count = await revokeFamily(FAMILY, 'reuse_detected');

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(handles).toEqual(['tx:refresh', 'tx:access']);
    expect(count).toBe(2);
  });

  it('does not report a count when the access-token update fails', async () => {
    // The half-revoked state is the one the function exists to prevent: refresh
    // chain dead, access tokens live for up to another hour. Returning a number
    // here would tell the caller the compromise was contained.
    transactionalDb({ failOnAccessTokens: true });

    await expect(revokeFamily(FAMILY, 'reuse_detected')).rejects.toThrow('connection lost');
    expect(handles).not.toContain('db:outside-transaction');
  });
});
