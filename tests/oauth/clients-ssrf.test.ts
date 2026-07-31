import { describe, expect, it, vi } from 'vitest';

// The database is mocked so the SSRF path can be reached without a connection.
// `select` returns nothing, so resolveClient always falls through to the fetch.
vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ uuid: 'x' }]) }) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
  },
}));

import { resolveClient } from '@/lib/oauth/clients';

const ISSUER = 'https://plugged.in';

/**
 * client_id is attacker-controlled: anyone may start an authorization request
 * with any value, and resolving it makes the server fetch that URL. These are
 * the destinations that must never be reached.
 */
describe('resolveClient SSRF protection', () => {
  it('refuses a client_id pointing at cloud metadata', async () => {
    const spy = vi.fn();
    const result = await resolveClient(
      'https://169.254.169.254/latest/meta-data/',
      ISSUER,
      spy as unknown as typeof fetch
    );
    expect(result).toBeUndefined();
  });

  it('refuses loopback', async () => {
    expect(await resolveClient('https://127.0.0.1/doc', ISSUER)).toBeUndefined();
  });

  it('refuses a private range', async () => {
    expect(await resolveClient('https://10.0.0.5/doc', ISSUER)).toBeUndefined();
    expect(await resolveClient('https://192.168.1.1/doc', ISSUER)).toBeUndefined();
  });

  it('refuses a non-https client_id without fetching', async () => {
    const spy = vi.fn();
    const result = await resolveClient(
      'http://claude.ai/metadata',
      ISSUER,
      spy as unknown as typeof fetch
    );
    expect(result).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it('defaults to the protected fetch, so protection is opt-out not opt-in', async () => {
    // No fetchImpl supplied: if the default were bare fetch, this would attempt
    // a real request to a link-local address instead of being refused.
    expect(await resolveClient('https://169.254.169.254/doc', ISSUER)).toBeUndefined();
  });
});
