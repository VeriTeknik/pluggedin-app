import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Resource indicators were read and then ignored (deepsec
 * pluggedin-app-other-token-audience-confusion-f637b46bab).
 *
 * An attacker's MCP server advertises Plugged.in as its authorization server. A
 * legitimate client then asks Plugged.in for a token with
 * `resource=https://attacker.example/mcp`, completes consent with its genuine
 * callback and PKCE, and hands the token to the attacker's server — which
 * replays it against /api/mcp, because nothing recorded or checked who the token
 * was for.
 *
 * This authorization server protects exactly one resource: the connector at
 * {NEXTAUTH_URL}/api/mcp. RFC 8707 s2: a request for any other resource is
 * refused with invalid_target, so every token issued is audience-bound to the
 * connector by construction.
 */

const m = vi.hoisted(() => ({
  resolveClient: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { url });
  }),
}));

vi.mock('@/db', () => ({ db: {} }));
vi.mock('next-auth/next', () => ({
  getServerSession: () => Promise.resolve({ user: { id: 'user-1' } }),
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/app/actions/projects', () => ({
  getProjects: () => Promise.resolve([{ uuid: 'hub-1', name: 'Hub One' }]),
}));
vi.mock('next/navigation', () => ({ redirect: m.redirect }));
vi.mock('@/lib/oauth/provider/clients', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/oauth/provider/clients')>()),
  resolveClient: m.resolveClient,
}));

import AuthorizePage from '@/app/oauth/authorize/page';
import { parseAuthorizeParams } from '@/lib/oauth/provider/authorize';

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

function params(resource?: string): URLSearchParams {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: 'https://claude.ai/oauth/claude-code-client-metadata',
    redirect_uri: REDIRECT,
    code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    code_challenge_method: 'S256',
    scope: 'library:read',
    state: 'xyz',
  });
  if (resource !== undefined) p.set('resource', resource);
  return p;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = 'test-secret-for-consent-tickets';
  process.env.NEXTAUTH_URL = 'https://plugged.in';
});

describe('authorization requests name a resource this server protects, or none', () => {
  it.each([
    ['another origin', 'https://attacker.example/mcp'],
    ['a tenant agent subdomain', 'https://evil.is.plugged.in/api/mcp'],
    ['a look-alike host', 'https://plugged.in.attacker.example/api/mcp'],
    ['plain http to our host', 'http://plugged.in/api/mcp'],
    ['another port on our host', 'https://plugged.in:8443/api/mcp'],
    ['a fragment (RFC 8707 s2)', 'https://plugged.in/api/mcp#x'],
    ['a relative reference', '/api/mcp'],
    ['garbage', 'not a uri'],
  ])('refuses %s with invalid_target', (_label, resource) => {
    const result = parseAuthorizeParams(params(resource));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_target');
  });

  it.each([
    'https://plugged.in/api/mcp',
    'https://plugged.in/api/mcp/',
    'https://PLUGGED.IN/api/mcp',
    'https://plugged.in:443/api/mcp',
  ])('accepts the connector resource written as %s', (resource) => {
    const result = parseAuthorizeParams(params(resource));
    expect(result.ok).toBe(true);
  });

  it('still accepts a request that names no resource (the connector is the default audience)', () => {
    expect(parseAuthorizeParams(params()).ok).toBe(true);
  });
});

describe('the authorize page', () => {
  beforeEach(() => {
    m.resolveClient.mockResolvedValue({
      uuid: 'client-uuid',
      client_id: 'https://claude.ai/oauth/claude-code-client-metadata',
      client_name: 'Claude',
      redirect_uris: [REDIRECT],
      registration_type: 'cimd',
    });
  });

  it('sends invalid_target back to the client instead of issuing a consent ticket', async () => {
    const searchParams = Object.fromEntries(params('https://attacker.example/mcp'));

    await expect(AuthorizePage({ searchParams: Promise.resolve(searchParams) })).rejects.toThrow(
      'NEXT_REDIRECT'
    );

    const target = new URL(m.redirect.mock.calls[0][0]);
    expect(`${target.origin}${target.pathname}`).toBe(REDIRECT);
    expect(target.searchParams.get('error')).toBe('invalid_target');
    expect(target.searchParams.get('state')).toBe('xyz');
  });

  it('issues a consent ticket for the connector resource', async () => {
    const searchParams = Object.fromEntries(params('https://plugged.in/api/mcp'));

    const element = (await AuthorizePage({ searchParams: Promise.resolve(searchParams) })) as {
      props: Record<string, unknown>;
    };

    expect(m.redirect).not.toHaveBeenCalled();
    expect(typeof element.props.ticket).toBe('string');
  });
});
