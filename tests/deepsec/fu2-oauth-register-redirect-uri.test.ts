/**
 * Dynamic client registration stored any string as a redirect URI.
 *
 * The authorize page and buildErrorRedirect re-check redirect URIs at use time,
 * but a registration endpoint that accepts `javascript:` or a plain-http
 * redirect to an arbitrary host is still handing out a client record the rest
 * of the flow has to distrust. RFC 7591 s3.2.2: refuse the registration with
 * invalid_redirect_uri instead, using the same rule as CIMD documents
 * (isAllowedRedirectUri).
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ values: vi.fn() }));

vi.mock('@/db', () => ({
  db: { insert: () => ({ values: async (row: unknown) => m.values(row) }) },
}));

import { POST } from '@/app/api/oauth/register/route';

function register(body: unknown) {
  return POST(
    new NextRequest('https://plugged.in/api/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_URL = 'https://plugged.in';
});

describe('DCR refuses redirect URIs that are not redirect targets', () => {
  it.each([
    ['javascript:', 'javascript:alert(document.cookie)'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['file:', 'file:///etc/passwd'],
    ['plain http to a remote host', 'http://attacker.example/callback'],
    ['a fragment', 'https://client.example/callback#frag'],
    ['userinfo', 'https://plugged.in@attacker.example/callback'],
    ['not a URI', 'not a uri'],
  ])('refuses %s with invalid_redirect_uri', async (_label, uri) => {
    const response = await register({ redirect_uris: [uri], client_name: 'x' });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_redirect_uri');
    expect(m.values).not.toHaveBeenCalled();
  });

  it('refuses the whole registration when any one URI is bad', async () => {
    const response = await register({
      redirect_uris: ['https://client.example/callback', 'javascript:alert(1)'],
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_redirect_uri');
    expect(m.values).not.toHaveBeenCalled();
  });

  it.each([
    ['https', 'https://claude.ai/api/mcp/auth_callback'],
    ['loopback http with a port', 'http://127.0.0.1:33418/callback'],
    ['localhost http', 'http://localhost/callback'],
    ['a native private-use scheme', 'cursor://anysphere.cursor-retrieval/oauth/callback'],
  ])('registers %s', async (_label, uri) => {
    const response = await register({ redirect_uris: [uri] });

    expect(response.status).toBe(201);
    expect((await response.json()).redirect_uris).toEqual([uri]);
    expect(m.values).toHaveBeenCalledWith(expect.objectContaining({ redirect_uris: [uri] }));
  });
});
