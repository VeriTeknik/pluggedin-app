/**
 * A hostname is not an address. `validateUrlForSSRF` can only judge the text of
 * a URL, so `http://internal.attacker.example/` — an ordinary public-looking
 * name whose A record is 127.0.0.1 — passed every check and safeFetch then sent
 * the request to loopback.
 *
 * Raised by sourcery-ai on PR #228 while reviewing GHSA-gmhc-h765-37cg. It is
 * the same failure the advisory describes, one layer down: the guard reasoned
 * about how a host was written instead of where it goes.
 *
 * safeFetch resolves the name and refuses if any address behind it is
 * non-global. That is not complete protection — see the note on rebinding in
 * ssrf-protection.ts — but it closes the case where a name simply points
 * inward.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lookup = vi.fn();
// safeFetch now hands each hop to pinnedFetch, which speaks node:http so the
// socket gets the address that was validated. That moved the seam: stubbing
// global fetch no longer intercepts anything.
vi.mock('@/lib/security/pinned-fetch', () => ({
  pinnedFetch: vi.fn((url, init) => (globalThis.fetch as unknown as (u: unknown, i: unknown) => Promise<Response>)(url, init)),
  pinnedLookup: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({ default: { lookup: (...a: unknown[]) => lookup(...a) } }));

const { safeFetch } = await import('@/lib/oauth/ssrf-protection');

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('safeFetch resolves the host before trusting it', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['169.254.169.254', 'cloud metadata'],
    ['10.1.2.3', 'RFC 1918'],
    ['::1', 'IPv6 loopback'],
    ['::ffff:7f00:1', 'IPv4-mapped loopback'],
  ])('refuses a public name that resolves to %s (%s)', async (address) => {
    lookup.mockResolvedValue([{ address, family: address.includes(':') ? 6 : 4 }]);

    await expect(safeFetch('https://internal.attacker.example/')).rejects.toThrow(
      /resolves to a private or reserved address/i
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses when only one of several addresses is private', async () => {
    // Rejecting outright rather than picking a public one: without connection
    // pinning the socket re-resolves, and there is no guarantee it lands on the
    // address that was approved.
    lookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);

    await expect(safeFetch('https://mixed.attacker.example/')).rejects.toThrow(
      /resolves to a private or reserved address/i
    );
  });

  it('allows a name that resolves to a public address', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

    const response = await safeFetch('https://example.com/');

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('refuses a host that does not resolve at all', async () => {
    lookup.mockRejectedValue(new Error('ENOTFOUND'));

    await expect(safeFetch('https://nowhere.example/')).rejects.toThrow(/could not be resolved/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not resolve an IP literal — the URL check already judged it', async () => {
    await expect(safeFetch('http://127.0.0.1/')).rejects.toThrow(/private or reserved/i);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('re-resolves each redirect hop, not just the first', async () => {
    lookup
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'https://second.example/' } })
    );

    await expect(safeFetch('https://first.example/')).rejects.toThrow(
      /resolves to a private or reserved address/i
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('root-qualified localhost', () => {
  it.each(['http://localhost./', 'http://LOCALHOST./', 'http://foo.localhost./'])(
    'rejects %s without needing DNS',
    async (url) => {
      await expect(safeFetch(url)).rejects.toThrow(/private or reserved/i);
      expect(lookup).not.toHaveBeenCalled();
    }
  );
});
