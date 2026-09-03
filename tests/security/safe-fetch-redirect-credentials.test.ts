import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// safeFetch resolves each hop's hostname before fetching it. These suites are
// about redirect handling, not about DNS, so every name here answers with one
// public address — otherwise the assertions would depend on what the network
// says about example.com today.
vi.mock('node:dns/promises', () => ({
  default: { lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]) },
}));


const { safeFetch } = await import('@/lib/oauth/ssrf-protection');

/** A 302 to `location`, then a 200. */
function redirectOnceTo(location: string) {
  fetchMock
    .mockResolvedValueOnce({
      status: 302,
      headers: new Headers({ location }),
      body: null,
    })
    .mockResolvedValueOnce({ status: 200, headers: new Headers(), body: null });
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * safeFetch follows redirects itself so it can revalidate each hop, and it
 * reused the caller's headers on every one. The callers here send credentials:
 * `Authorization: Basic <client id and secret>` to an OAuth token endpoint, and
 * `X-Collector-Key` to a cluster collector. A redirect to a different origin
 * therefore handed those to whoever answered it — and the destination is chosen
 * by the very server the credentials authenticate against.
 *
 * Browsers drop `Authorization` on a cross-origin redirect for exactly this
 * reason; this is the same rule.
 */
describe('safeFetch does not carry credentials across origins', () => {
  it('drops Authorization when the redirect changes origin', async () => {
    redirectOnceTo('https://elsewhere.example.net/token');

    await safeFetch('https://issuer.example.com/token', {
      method: 'POST',
      headers: { Authorization: 'Basic c2VjcmV0', 'Content-Type': 'application/json' },
    });

    const second = fetchMock.mock.calls[1][1];
    const headers = new Headers(second.headers);
    expect(headers.get('authorization')).toBeNull();
    // A header that carries no credential is not the point and stays.
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('drops other credential headers too', async () => {
    redirectOnceTo('https://elsewhere.example.net/agents');

    await safeFetch('https://collector.example.com/agents', {
      headers: { 'X-Collector-Key': 'secret', Cookie: 'session=1' },
    });

    const headers = new Headers(fetchMock.mock.calls[1][1].headers);
    expect(headers.get('x-collector-key')).toBeNull();
    expect(headers.get('cookie')).toBeNull();
  });

  it('keeps them on a same-origin redirect', async () => {
    redirectOnceTo('https://issuer.example.com/token/v2');

    await safeFetch('https://issuer.example.com/token', {
      method: 'POST',
      headers: { Authorization: 'Basic c2VjcmV0' },
    });

    const headers = new Headers(fetchMock.mock.calls[1][1].headers);
    expect(headers.get('authorization')).toBe('Basic c2VjcmV0');
  });

  it('treats a scheme or port change as a different origin', async () => {
    redirectOnceTo('https://issuer.example.com:8443/token');

    await safeFetch('https://issuer.example.com/token', {
      headers: { Authorization: 'Basic c2VjcmV0' },
    });

    const headers = new Headers(fetchMock.mock.calls[1][1].headers);
    expect(headers.get('authorization')).toBeNull();
  });
});

/**
 * 307 and 308 replay the request, body included. A URLSearchParams body — what
 * the OAuth token exchange sends — is consumed by the first request, so the
 * replay went out empty.
 */
describe('safeFetch can replay the body a 307 preserves', () => {
  it('sends the same body on the second hop', async () => {
    fetchMock
      .mockResolvedValueOnce({
        status: 307,
        headers: new Headers({ location: 'https://issuer.example.com/v2/token' }),
        body: null,
      })
      .mockResolvedValueOnce({ status: 200, headers: new Headers(), body: null });

    await safeFetch('https://issuer.example.com/token', {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'authorization_code', code: 'abc' }),
    });

    const first = fetchMock.mock.calls[0][1].body;
    const second = fetchMock.mock.calls[1][1].body;

    expect(typeof second).toBe('string');
    expect(second).toBe(first);
    expect(second).toContain('grant_type=authorization_code');
  });

  it('sets the form content type when the caller did not', async () => {
    fetchMock.mockResolvedValueOnce({ status: 200, headers: new Headers(), body: null });

    await safeFetch('https://issuer.example.com/token', {
      method: 'POST',
      body: new URLSearchParams({ code: 'abc' }),
    });

    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get('content-type')).toBe('application/x-www-form-urlencoded;charset=UTF-8');
  });
});
