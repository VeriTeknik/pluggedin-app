import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * DCR registrations carry a 30-day TTL so the client table cannot grow without
 * bound. That TTL was never checked on read, which made it decorative: an
 * expired registration kept working indefinitely.
 */

const rows: Record<string, unknown>[] = [];

vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }) }),
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ uuid: 'new' }]) }) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
  },
}));

import { resolveClient } from '@/lib/oauth/clients';

const ISSUER = 'https://plugged.in';
const PAST = new Date(Date.now() - 1_000);
const FUTURE = new Date(Date.now() + 86_400_000);

function dcrRow(expiresAt: Date | null) {
  return {
    uuid: 'client-uuid',
    client_id: 'opaque-dcr-id',
    issuer: ISSUER,
    registration_type: 'dcr',
    redirect_uris: ['https://example.com/cb'],
    metadata_fetched_at: null,
    expires_at: expiresAt,
  };
}

beforeEach(() => {
  rows.length = 0;
});

describe('DCR client expiry', () => {
  it('returns a DCR client that has not expired', async () => {
    rows.push(dcrRow(FUTURE));
    const result = await resolveClient('opaque-dcr-id', ISSUER);
    expect(result?.uuid).toBe('client-uuid');
  });

  it('refuses an expired DCR client', async () => {
    rows.push(dcrRow(PAST));
    expect(await resolveClient('opaque-dcr-id', ISSUER)).toBeUndefined();
  });

  it('does not try to re-fetch an expired DCR client as if it were CIMD', async () => {
    // An opaque DCR id is not a URL; attempting a fetch would be nonsense, and
    // an expired registration has nothing to refresh from anyway.
    const fetchSpy = vi.fn();
    rows.push(dcrRow(PAST));
    await resolveClient('opaque-dcr-id', ISSUER, fetchSpy as unknown as typeof fetch);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still returns a DCR client with no expiry set', async () => {
    rows.push(dcrRow(null));
    expect((await resolveClient('opaque-dcr-id', ISSUER))?.uuid).toBe('client-uuid');
  });
});
