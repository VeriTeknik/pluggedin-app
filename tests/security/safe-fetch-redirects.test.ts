import { afterEach, describe, expect, it, vi } from 'vitest';

// safeFetch resolves each hop's hostname before fetching it. These suites are
// about redirect handling, not about DNS, so every name here answers with one
// public address — otherwise the assertions would depend on what the network
// says about example.com today.
// safeFetch now hands each hop to pinnedFetch, which speaks node:http so the
// socket gets the address that was validated. That moved the seam: stubbing
// global fetch no longer intercepts anything.
vi.mock('@/lib/security/pinned-fetch', () => ({
  pinnedFetch: vi.fn((url, init) => (globalThis.fetch as unknown as (u: unknown, i: unknown) => Promise<Response>)(url, init)),
  pinnedLookup: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({
  default: { lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]) },
}));

const { safeFetch } = await import('@/lib/oauth/ssrf-protection');

/**
 * safeFetch validates the URL it is given, but fetch follows redirects by
 * default — so a public host answering 302 with a private Location bypassed the
 * guard entirely. These tests pin the behaviour that every hop is validated.
 */

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

function ok(body = '{}'): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('redirect method downgrade (RFC 9110)', () => {
  function redirectStatus(status: number): Response {
    return new Response(null, { status, headers: { location: 'https://other.example/final' } });
  }

  for (const status of [301, 302, 303]) {
    it(`turns a POST into a GET and drops the body on ${status}`, async () => {
      // Replaying a POST body to a redirect target is a spec violation and a way
      // to deliver a payload somewhere the caller never addressed.
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(redirectStatus(status))
        .mockResolvedValueOnce(ok());

      await safeFetch('https://public.example/start', { method: 'POST', body: 'secret=1' });

      const second = fetchSpy.mock.calls[1][1] as RequestInit;
      expect(second.method).toBe('GET');
      expect(second.body).toBeUndefined();
    });
  }

  for (const status of [307, 308]) {
    it(`preserves the method and body on ${status}`, async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(redirectStatus(status))
        .mockResolvedValueOnce(ok());

      await safeFetch('https://public.example/start', { method: 'POST', body: 'secret=1' });

      const second = fetchSpy.mock.calls[1][1] as RequestInit;
      expect(second.method).toBe('POST');
      expect(second.body).toBe('secret=1');
    });
  }
});

describe('safeFetch redirect handling', () => {
  it('refuses a redirect that lands on cloud metadata', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(redirectTo('http://169.254.169.254/latest/meta-data/'));

    await expect(safeFetch('https://public.example/start')).rejects.toThrow(
      /private or reserved/i
    );
    // The second hop must never be attempted.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('refuses a redirect to loopback', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(redirectTo('http://127.0.0.1:8080/admin'));
    await expect(safeFetch('https://public.example/start')).rejects.toThrow(/private or reserved/i);
  });

  it('refuses a redirect to a private range', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(redirectTo('http://10.0.0.5/internal'));
    await expect(safeFetch('https://public.example/start')).rejects.toThrow(/private or reserved/i);
  });

  it('resolves a relative Location against the current URL before validating', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(redirectTo('/next'))
      .mockResolvedValueOnce(ok('{"ok":true}'));

    const response = await safeFetch('https://public.example/start');
    expect(response.status).toBe(200);
    // fetch now receives the validated URL object rather than a string.
    expect(String(fetchSpy.mock.calls[1][0])).toBe('https://public.example/next');
  });

  it('still follows a redirect between public hosts', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(redirectTo('https://other.example/final'))
      .mockResolvedValueOnce(ok());

    const response = await safeFetch('https://public.example/start');
    expect(response.status).toBe(200);
  });

  it('stops rather than looping forever on a redirect cycle', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(redirectTo('https://public.example/loop'));
    await expect(safeFetch('https://public.example/loop')).rejects.toThrow(/too many redirects/i);
  });

  it('follows at most 20 hops, matching the fetch specification', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(redirectTo('https://public.example/loop'));
    await expect(safeFetch('https://public.example/start')).rejects.toThrow(/too many redirects/i);
    // 20, not 21 — the loop bound was inclusive.
    expect(fetchSpy).toHaveBeenCalledTimes(20);
  });

  it('returns a redirect response unchanged when it carries no Location', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 302 }));
    const response = await safeFetch('https://public.example/start');
    expect(response.status).toBe(302);
  });

  it('passes the caller’s options through on every hop', async () => {
    // `redirect: 'manual'` used to be asserted here too. It is gone from the
    // options because hops no longer go through fetch at all: pinnedFetch
    // speaks node:http and never follows a redirect, so not following one is
    // structural rather than a flag that could be forgotten.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(redirectTo('https://other.example/final'))
      .mockResolvedValueOnce(ok());

    await safeFetch('https://public.example/start', { headers: { Accept: 'application/json' } });

    for (const call of fetchSpy.mock.calls) {
      const init = call[1] as RequestInit;
      // Read through Headers: a cross-origin hop rebuilds the container while
      // dropping credential headers, so the shape differs between hops even
      // though a non-credential header like Accept survives both.
      expect(new Headers(init.headers).get('accept')).toBe('application/json');
    }
  });

  it('releases each redirect body instead of leaving the stream open', async () => {
    // redirect: 'manual' hands back a response per hop that nobody reads.
    // undici keeps the stream and its connection alive until GC, and these
    // callers resolve attacker-supplied URLs — so a hostile host answering with
    // large-bodied redirects turns twenty hops into twenty open streams.
    const cancels: string[] = [];
    const hop = (name: string, location: string) => {
      const response = new Response('x'.repeat(1024), { status: 302, headers: { location } });
      vi.spyOn(response.body as ReadableStream, 'cancel').mockImplementation(() => {
        cancels.push(name);
        return Promise.resolve();
      });
      return response;
    };

    const final = ok();
    const finalCancel = vi.spyOn(final.body as ReadableStream, 'cancel');

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(hop('first', 'https://public.example/second'))
      .mockResolvedValueOnce(hop('second', 'https://public.example/final'))
      .mockResolvedValueOnce(final);

    const result = await safeFetch('https://public.example/start');

    expect(cancels).toEqual(['first', 'second']);
    // The response handed to the caller is theirs to read.
    expect(finalCancel).not.toHaveBeenCalled();
    expect(await result.text()).toBe('{}');
  });

  it('still returns the response when releasing a redirect body fails', async () => {
    const broken = new Response('body', { status: 302, headers: { location: 'https://public.example/final' } });
    vi.spyOn(broken.body as ReadableStream, 'cancel').mockRejectedValue(new Error('already locked'));

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(broken)
      .mockResolvedValueOnce(ok());

    await expect(safeFetch('https://public.example/start')).resolves.toBeDefined();
  });
});
