import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The authorize page flattened repeated query keys to their FIRST value before
 * parseAuthorizeParams saw them. parseAuthorizeParams checks every `resource`
 * (RFC 8707 lets it repeat), but only ever received one, so
 *
 *   ?resource=<connector>&resource=https://attacker.example/mcp
 *
 * passed as a request for the connector alone. RFC 6749 s3.1 also says request
 * parameters MUST NOT be included more than once; a repeated single-valued
 * parameter is ambiguous and is now refused with invalid_request — rendered, not
 * redirected, when the ambiguity is in client_id or redirect_uri themselves
 * (s4.1.2.1), because then there is no trustworthy place to redirect to.
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
const CONNECTOR = 'https://plugged.in/api/mcp';

const base: Record<string, string> = {
  response_type: 'code',
  client_id: 'https://claude.ai/oauth/claude-code-client-metadata',
  redirect_uri: REDIRECT,
  code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  code_challenge_method: 'S256',
  scope: 'library:read',
  state: 'xyz',
};

/** What Next hands the page for a query string: repeated keys become arrays. */
type RawSearchParams = Record<string, string | string[] | undefined>;

async function renderPage(raw: RawSearchParams) {
  return (await AuthorizePage({ searchParams: Promise.resolve(raw) })) as {
    props: Record<string, unknown>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = 'test-secret-for-consent-tickets';
  process.env.NEXTAUTH_URL = 'https://plugged.in';
  m.resolveClient.mockResolvedValue({
    uuid: 'client-uuid',
    client_id: base.client_id,
    client_name: 'Claude',
    redirect_uris: [REDIRECT],
    registration_type: 'cimd',
  });
});

describe('the authorize page keeps every value of a repeated parameter', () => {
  it('refuses a connector resource smuggled next to an attacker resource', async () => {
    await expect(
      renderPage({ ...base, resource: [CONNECTOR, 'https://attacker.example/mcp'] })
    ).rejects.toThrow('NEXT_REDIRECT');

    const target = new URL(m.redirect.mock.calls[0][0]);
    expect(`${target.origin}${target.pathname}`).toBe(REDIRECT);
    expect(target.searchParams.get('error')).toBe('invalid_target');
    expect(target.searchParams.get('state')).toBe('xyz');
  });

  it('still accepts the connector named twice', async () => {
    const element = await renderPage({ ...base, resource: [CONNECTOR, CONNECTOR] });

    expect(m.redirect).not.toHaveBeenCalled();
    expect(typeof element.props.ticket).toBe('string');
  });

  it.each(['state', 'code_challenge', 'code_challenge_method', 'response_type', 'scope'])(
    'sends invalid_request back to the client when %s is repeated',
    async (name) => {
      await expect(renderPage({ ...base, [name]: [base[name], base[name]] })).rejects.toThrow(
        'NEXT_REDIRECT'
      );

      const target = new URL(m.redirect.mock.calls[0][0]);
      expect(`${target.origin}${target.pathname}`).toBe(REDIRECT);
      expect(target.searchParams.get('error')).toBe('invalid_request');
    }
  );

  it.each(['client_id', 'redirect_uri'])(
    'renders an error instead of redirecting when %s is repeated',
    async (name) => {
      const element = await renderPage({ ...base, [name]: [base[name], 'https://attacker.example/cb'] });

      expect(m.redirect).not.toHaveBeenCalled();
      expect(element.props.ticket).toBeUndefined();
      expect(m.resolveClient).not.toHaveBeenCalled();
    }
  );
});

describe('parseAuthorizeParams refuses repeated single-valued parameters (RFC 6749 s3.1)', () => {
  it.each([
    'response_type',
    'client_id',
    'redirect_uri',
    'state',
    'code_challenge',
    'code_challenge_method',
    'scope',
  ])('rejects a repeated %s with invalid_request', (name) => {
    const p = new URLSearchParams(base);
    p.append(name, base[name]);

    const result = parseAuthorizeParams(p);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid_request');
      expect(result.description).toContain(name);
    }
  });

  it('lets resource repeat (RFC 8707 s2) and checks every occurrence', () => {
    const p = new URLSearchParams(base);
    p.append('resource', CONNECTOR);
    p.append('resource', 'https://attacker.example/mcp');

    const result = parseAuthorizeParams(p);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_target');
  });
});
