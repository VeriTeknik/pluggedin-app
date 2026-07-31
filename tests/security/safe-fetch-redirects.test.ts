import { afterEach, describe, expect, it, vi } from 'vitest';

import { safeFetch } from '@/lib/oauth/ssrf-protection';

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
    expect(fetchSpy.mock.calls[1][0]).toBe('https://public.example/next');
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

  it('returns a redirect response unchanged when it carries no Location', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 302 }));
    const response = await safeFetch('https://public.example/start');
    expect(response.status).toBe(302);
  });

  it('passes the caller’s options through on every hop', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(redirectTo('https://other.example/final'))
      .mockResolvedValueOnce(ok());

    await safeFetch('https://public.example/start', { headers: { Accept: 'application/json' } });

    for (const call of fetchSpy.mock.calls) {
      const init = call[1] as RequestInit;
      expect((init.headers as Record<string, string>).Accept).toBe('application/json');
      // Redirects must be handled by us, not by fetch.
      expect(init.redirect).toBe('manual');
    }
  });
});
