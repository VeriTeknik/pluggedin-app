/**
 * The token endpoint ignored the `resource` parameter.
 *
 * The authorize page refuses a foreign resource (invalid_target), but a client
 * can also name one at the token endpoint — for the code exchange and for every
 * refresh (RFC 8707 s2.2). Issuing anyway hands the client a token it believes
 * is for another server, which that server can replay here. This server
 * protects one resource, so any other value is refused with invalid_target
 * before a code is spent or a refresh token rotated. RFC 8707 allows the
 * parameter to repeat; every occurrence must name the connector.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  redeem: vi.fn(),
  rotate: vi.fn(),
}));

const CLIENT = {
  uuid: 'client-uuid',
  client_id: 'https://claude.ai/oauth/claude-code-client-metadata',
  expires_at: null,
};

vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [CLIENT] }) }) }),
  },
}));
vi.mock('@/lib/oauth/provider/grants', () => ({
  redeemAuthorizationCode: m.redeem,
  rotateRefreshToken: m.rotate,
}));

import { POST } from '@/app/api/oauth/token/route';
import { parseAuthorizeParams } from '@/lib/oauth/provider/authorize';

const TOKENS = {
  access_token: 'a',
  refresh_token: 'r',
  expires_in: 3600,
  token_type: 'Bearer',
  scope: 'library:read',
};

function tokenRequest(grant: 'authorization_code' | 'refresh_token', resources: string[] = []) {
  const form = new URLSearchParams({ grant_type: grant, client_id: CLIENT.client_id });
  if (grant === 'authorization_code') {
    form.set('code', 'the-code');
    form.set('redirect_uri', 'https://claude.ai/api/mcp/auth_callback');
    form.set('code_verifier', 'verifier');
  } else {
    form.set('refresh_token', 'the-refresh-token');
  }
  for (const resource of resources) form.append('resource', resource);
  return POST(
    new NextRequest('https://plugged.in/api/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_URL = 'https://plugged.in';
  m.redeem.mockResolvedValue({ ok: true, tokens: TOKENS });
  m.rotate.mockResolvedValue({ ok: true, tokens: TOKENS });
});

describe.each(['authorization_code', 'refresh_token'] as const)('%s grant', (grant) => {
  const spend = () => (grant === 'authorization_code' ? m.redeem : m.rotate);

  it.each([
    ['another origin', ['https://attacker.example/mcp']],
    ['a tenant agent subdomain', ['https://evil.is.plugged.in/api/mcp']],
    ['a foreign resource after the connector', ['https://plugged.in/api/mcp', 'https://attacker.example/mcp']],
    ['garbage', ['not a uri']],
  ])('refuses %s with invalid_target and spends nothing', async (_label, resources) => {
    const response = await tokenRequest(grant, resources);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_target');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(spend()).not.toHaveBeenCalled();
  });

  it('issues for the connector resource', async () => {
    const response = await tokenRequest(grant, ['https://plugged.in/api/mcp']);

    expect(response.status).toBe(200);
    expect(spend()).toHaveBeenCalledTimes(1);
  });

  it('issues when no resource is named (the connector is the default audience)', async () => {
    const response = await tokenRequest(grant);

    expect(response.status).toBe(200);
    expect(spend()).toHaveBeenCalledTimes(1);
  });
});

describe('the authorize request checks every resource parameter, not just the first', () => {
  it('refuses a foreign resource hidden behind the connector one', () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT.client_id,
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
    });
    params.append('resource', 'https://plugged.in/api/mcp');
    params.append('resource', 'https://attacker.example/mcp');

    const result = parseAuthorizeParams(params);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_target');
  });
});
