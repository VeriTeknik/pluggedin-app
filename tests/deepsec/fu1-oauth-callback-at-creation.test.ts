/**
 * StreamableHTTPWrapper intercepts an OAuth authorization request, stores the
 * redirect_uri it carried as the flow's callback_url, and later the callback
 * route forwards the provider's response there — a server-side GET on the
 * production host. The route now forwards only to a local OAuth listener
 * (http, loopback, unprivileged port, /oauth/callback), but the wrapper still
 * stored whatever the request named: any host, any path, any port. The same
 * rule belongs where the URL enters, so no flow can be created for anything
 * else.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ createOAuthSession: vi.fn() }));

vi.mock('@/lib/mcp/oauth/OAuthStateManager', () => ({
  oauthStateManager: { createOAuthSession: m.createOAuthSession },
}));
vi.mock('@/lib/mcp/sessions/SessionManager', () => ({ getSessionManager: () => ({}) }));

import { oauthCallbackListener } from '@/lib/mcp/transports/oauth-callback-listener';
import { StreamableHTTPWrapper } from '@/lib/mcp/transports/StreamableHTTPWrapper';

const AUTHORIZE = 'https://auth.example.com/oauth/authorize';

function wrapper(): any {
  return new StreamableHTTPWrapper(new URL('https://mcp.example.com/mcp'), {}, 'server-uuid', 'profile-uuid');
}

function authorizationRequest(redirectUri: string): URL {
  const url = new URL(AUTHORIZE);
  url.searchParams.set('client_id', 'c');
  url.searchParams.set('redirect_uri', redirectUri);
  return url;
}

const REFUSED = [
  'http://169.254.169.254/latest/meta-data/',
  'http://evil.example:3334/oauth/callback',
  'http://127.0.0.1.nip.io:3334/oauth/callback',
  'https://localhost:3334/oauth/callback',
  'http://localhost/oauth/callback',
  'http://localhost:80/oauth/callback',
  'http://localhost:5432/',
  'http://localhost:3334/admin',
  'http://localhost:3334/oauth/callback?next=/admin',
  'http://user:pw@localhost:3334/oauth/callback',
  'http://10.0.0.5:3334/oauth/callback',
  'not a url',
];

const ALLOWED = [
  ['http://localhost:3334/oauth/callback', 'http://localhost:3334/oauth/callback'],
  ['http://127.0.0.1:14881/oauth/callback', 'http://127.0.0.1:14881/oauth/callback'],
  ['http://[::1]:40000/oauth/callback', 'http://[::1]:40000/oauth/callback'],
  ['http://LOCALHOST:3334/oauth/callback', 'http://localhost:3334/oauth/callback'],
];

beforeEach(() => {
  vi.clearAllMocks();
  m.createOAuthSession.mockResolvedValue('STATE');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('oauthCallbackListener', () => {
  it.each(REFUSED)('refuses %s', (candidate) => {
    expect(oauthCallbackListener(candidate)).toBeNull();
  });

  it.each(ALLOWED)('accepts %s', (candidate, normalised) => {
    expect(oauthCallbackListener(candidate)?.toString()).toBe(normalised);
  });
});

describe('StreamableHTTPWrapper creates an OAuth flow only for a local listener', () => {
  it.each(REFUSED.filter((uri) => uri !== 'not a url'))('creates no flow for %s', async (redirectUri) => {
    const response = await wrapper().handleOAuthAuthorizationRequest(authorizationRequest(redirectUri));

    expect(response).toBeNull();
    expect(m.createOAuthSession).not.toHaveBeenCalled();
  });

  it.each(ALLOWED)('stores %s as the normalised listener', async (redirectUri, normalised) => {
    const response = await wrapper().handleOAuthAuthorizationRequest(authorizationRequest(redirectUri));

    expect(response).not.toBeNull();
    expect(m.createOAuthSession).toHaveBeenCalledWith('server-uuid', 'profile-uuid', normalised, expect.any(String));
  });

  it('applies the same rule to a callback taken from a form body', async () => {
    const response = await wrapper().handleOAuthAuthorizationRequest(new URL(AUTHORIZE), {
      method: 'POST',
      body: new URLSearchParams({ redirect_uri: 'http://localhost:6379/' }),
    });

    expect(response).toBeNull();
    expect(m.createOAuthSession).not.toHaveBeenCalled();
  });
});
