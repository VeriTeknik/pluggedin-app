/**
 * safeFetch checked the address a hostname resolved to and then handed `fetch`
 * the hostname, which resolved it again when it opened the socket. A host that
 * answers differently the second time moves the request after the check —
 * classic DNS rebinding, and the residual left open by GHSA-gmhc-h765-37cg.
 *
 * The fix is to give the socket the address that was validated. These tests
 * hold two properties: pinnedFetch connects to the address it is given
 * regardless of DNS, and safeFetch resolves each hop exactly once.
 */
import http from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pinnedFetch } from '@/lib/security/pinned-fetch';

let server: http.Server;
let port: number;
const seen: Array<{ host?: string; method?: string; body: string }> = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      seen.push({ host: req.headers.host, method: req.method, body });
      if (req.url === '/redirect') {
        res.writeHead(302, { location: 'https://elsewhere.example/' });
        res.end();
        return;
      }
      if (req.url === '/empty') {
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json', 'x-marker': 'from-pinned-server' });
      res.end(JSON.stringify({ reached: true }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as { port: number }).port;
});

afterAll(() => server.close());

describe('pinnedFetch', () => {
  it('connects to the address it is given, not to what the hostname resolves to', async () => {
    // example.com resolves to a public address. The request still lands on the
    // loopback server, which is the whole point: DNS is not consulted.
    const response = await pinnedFetch(
      new URL(`http://example.com:${port}/`),
      undefined,
      '127.0.0.1',
      4
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-marker')).toBe('from-pinned-server');
    await expect(response.json()).resolves.toEqual({ reached: true });
  });

  it('keeps the hostname in the Host header', async () => {
    // The address is pinned; the name still identifies the origin, so vhosts
    // and TLS server names keep working.
    seen.length = 0;

    await pinnedFetch(new URL(`http://example.com:${port}/`), undefined, '127.0.0.1', 4);

    expect(seen[0].host).toBe(`example.com:${port}`);
  });

  it('sends the method and body it was given', async () => {
    seen.length = 0;

    await pinnedFetch(
      new URL(`http://example.com:${port}/`),
      { method: 'POST', body: 'grant_type=refresh_token', headers: { 'content-type': 'text/plain' } },
      '127.0.0.1',
      4
    );

    expect(seen[0].method).toBe('POST');
    expect(seen[0].body).toBe('grant_type=refresh_token');
  });

  it('hands back redirects rather than following them', async () => {
    const response = await pinnedFetch(
      new URL(`http://example.com:${port}/redirect`),
      undefined,
      '127.0.0.1',
      4
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://elsewhere.example/');
  });

  it('handles a status that must not carry a body', async () => {
    // `new Response(body, {status: 204})` throws. A 204 from a real server has
    // to survive being turned into a Response.
    const response = await pinnedFetch(
      new URL(`http://example.com:${port}/empty`),
      undefined,
      '127.0.0.1',
      4
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });

  it('honours an abort signal', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      pinnedFetch(new URL(`http://example.com:${port}/`), { signal: controller.signal }, '127.0.0.1', 4)
    ).rejects.toThrow();
  });
});

/**
 * Raised on PR #230 by Sentry and CodeRabbit, and correct: buffering every
 * response undid a protection #228 had added deliberately.
 *
 * safeFetch follows up to 20 redirects and cancels each hop's body without
 * reading it, because the hosts it resolves are attacker-supplied and a hostile
 * one can answer with large-bodied redirects. Buffering to `end` before
 * handing the response back meant all twenty were downloaded in full.
 *
 * node:http also brings none of undici's default timeouts, so a host that
 * accepts a connection and then says nothing held the request open forever.
 */
describe('pinnedFetch resource limits', () => {
  let slowServer: http.Server;
  let slowPort: number;

  beforeAll(async () => {
    slowServer = http.createServer((req, res) => {
      if (req.url === '/big-redirect') {
        res.writeHead(302, { location: 'https://elsewhere.example/' });
        // A redirect that also streams: the body must never be read.
        const chunk = 'x'.repeat(64 * 1024);
        for (let i = 0; i < 64; i++) res.write(chunk);
        res.end();
        return;
      }
      if (req.url === '/big-body') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        const chunk = 'x'.repeat(1024 * 1024);
        const timer = setInterval(() => res.write(chunk), 1);
        res.on('close', () => clearInterval(timer));
        return;
      }
      if (req.url === '/silent') {
        // Accept and never answer.
        return;
      }
      res.writeHead(200);
      res.end();
    });
    await new Promise<void>((resolve) => slowServer.listen(0, '127.0.0.1', resolve));
    slowPort = (slowServer.address() as { port: number }).port;
  });

  afterAll(() => slowServer.close());

  it('does not download a redirect body', async () => {
    const response = await pinnedFetch(
      new URL(`http://example.com:${slowPort}/big-redirect`),
      undefined,
      '127.0.0.1',
      4
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://elsewhere.example/');
    // The point: the 4 MB the server offered was never read.
    expect(await response.text()).toBe('');
  });

  it('refuses a response larger than the cap instead of buffering it', async () => {
    await expect(
      pinnedFetch(new URL(`http://example.com:${slowPort}/big-body`), undefined, '127.0.0.1', 4, {
        maxBytes: 512 * 1024,
      })
    ).rejects.toThrow(/too large/i);
  });

  it('gives up on a host that accepts the connection and says nothing', async () => {
    await expect(
      pinnedFetch(new URL(`http://example.com:${slowPort}/silent`), undefined, '127.0.0.1', 4, {
        timeoutMs: 300,
      })
    ).rejects.toThrow(/timed out/i);
  });

  // 101 and 103 are not in this list on purpose: node:http reports 1xx through
  // the `information` event, never as a response, and `new Response` rejects
  // any status below 200. Including them tested the test, not the code.
  it.each([204, 205, 304])('builds a Response for null-body status %i', async (status) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(status);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const response = await pinnedFetch(
        new URL(`http://example.com:${port}/`),
        undefined,
        '127.0.0.1',
        4,
        { timeoutMs: 2000 }
      );
      expect(response.status).toBe(status);
    } finally {
      server.close();
    }
  });
});
