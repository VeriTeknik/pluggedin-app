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
