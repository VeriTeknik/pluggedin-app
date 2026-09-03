/**
 * pinnedHeadRequest hands the socket a `lookup` so the connection goes to the
 * address that was validated. It answered that lookup with the scalar form
 * `callback(null, address, family)` only — but net.connect asks with
 * `all: true` when it is choosing between address families, and then expects an
 * array. The scalar answer fails with ERR_INVALID_IP_ADDRESS instead of falling
 * back, so *every* call returned `{ error: 'Invalid IP address: undefined' }`
 * and every SSE health check reported the server unreachable.
 *
 * Fail-closed, so nothing was let through — but the feature did not work.
 */
import http from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pinnedHeadRequest } from '@/lib/mcp/pinned-head-request';

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/moved') {
      res.writeHead(302, { location: 'http://elsewhere.example/' });
      res.end();
      return;
    }
    res.writeHead(200);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as { port: number }).port;
});

afterAll(() => server.close());

describe('pinnedHeadRequest', () => {
  it('reaches a public host and reports its status', async () => {
    const result = await pinnedHeadRequest('https://example.com/', 8000);

    expect(result).not.toHaveProperty('error');
    expect(result).toHaveProperty('status');
    expect((result as { status: number }).status).toBeGreaterThanOrEqual(200);
  });

  it('reports the status rather than an IP-address error', async () => {
    // The regression this file exists for: the failure mode was an error
    // string, not a wrong status, so asserting "no error" is the assertion.
    const result = await pinnedHeadRequest('https://example.com/', 8000);

    expect(JSON.stringify(result)).not.toMatch(/Invalid IP address/);
  });

  it('still refuses a host that resolves to a private address', async () => {
    const result = await pinnedHeadRequest(`http://localhost:${port}/`, 3000);

    expect(result).toEqual({ error: 'host resolves to a private address' });
  });

  it('refuses a malformed url', async () => {
    await expect(pinnedHeadRequest('not-a-url', 3000)).resolves.toEqual({ error: 'malformed url' });
  });
});
