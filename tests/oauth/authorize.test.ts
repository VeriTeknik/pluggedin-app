import { describe, expect, it } from 'vitest';
import { buildErrorRedirect, parseAuthorizeParams } from '@/lib/oauth/authorize';

function params(overrides: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({
    response_type: 'code',
    client_id: 'https://claude.ai/oauth/claude-code-client-metadata',
    redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
    code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    code_challenge_method: 'S256',
    scope: 'library:read memory:read offline_access',
    state: 'xyz',
    ...overrides,
  });
}

describe('parsing an authorization request', () => {
  it('accepts a complete request', () => {
    const result = parseAuthorizeParams(params());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.scopes).toEqual(['library:read', 'memory:read', 'offline_access']);
      expect(result.request.state).toBe('xyz');
    }
  });

  it('rejects a response_type other than code', () => {
    const result = parseAuthorizeParams(params({ response_type: 'token' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_response_type');
  });

  it('requires PKCE — a missing challenge is fatal', () => {
    const p = params();
    p.delete('code_challenge');
    const result = parseAuthorizeParams(p);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_request');
  });

  it('rejects the plain challenge method', () => {
    const result = parseAuthorizeParams(params({ code_challenge_method: 'plain' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_request');
  });

  it('requires client_id and redirect_uri', () => {
    for (const key of ['client_id', 'redirect_uri']) {
      const p = params();
      p.delete(key);
      expect(parseAuthorizeParams(p).ok).toBe(false);
    }
  });

  it('drops unknown scopes rather than failing the request', () => {
    const result = parseAuthorizeParams(params({ scope: 'library:read nonsense:scope' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.request.scopes).toEqual(['library:read']);
  });

  it('defaults code_challenge_method to S256 when omitted', () => {
    const p = params();
    p.delete('code_challenge_method');
    const result = parseAuthorizeParams(p);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.request.codeChallengeMethod).toBe('S256');
  });
});

describe('error redirects', () => {
  it('returns the error and state on the redirect URI', () => {
    const url = new URL(
      buildErrorRedirect(
        'https://claude.ai/api/mcp/auth_callback',
        'access_denied',
        'User declined',
        'xyz'
      )
    );
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('error_description')).toBe('User declined');
    expect(url.searchParams.get('state')).toBe('xyz');
  });

  it('omits state when there was none', () => {
    const url = new URL(
      buildErrorRedirect('https://claude.ai/api/mcp/auth_callback', 'invalid_request', 'bad', null)
    );
    expect(url.searchParams.has('state')).toBe(false);
  });
});
