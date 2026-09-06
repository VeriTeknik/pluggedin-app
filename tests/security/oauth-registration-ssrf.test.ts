/**
 * Dynamic client registration must not be an SSRF hole.
 *
 * `registerOAuthClient` POSTed to `registrationEndpoint` with plain `fetch`.
 * That endpoint is not ours: it comes from the remote server's own OAuth
 * metadata document, fetched during discovery. `trigger-mcp-oauth.ts`
 * validates `server.url` with validateUrlForSSRF and then hands the
 * *metadata's* `registration_endpoint` straight through unvalidated.
 *
 * So: register an MCP server on a host you control — public, passes the URL
 * check — and answer discovery with
 * `{"registration_endpoint": "http://169.254.169.254/latest/meta-data/"}`.
 * The app POSTs there, server-side.
 *
 * Reported in the August scan as "OAuth metadata discovery and dynamic client
 * registration bypass this file's own SSRF guard" and never fixed; re-found on
 * 2026-09-06 and confirmed by reading the call.
 *
 * safeFetch is the fix: it validates, resolves, refuses non-global addresses
 * and pins the connection to the address it checked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const lookup = vi.fn();
vi.mock('node:dns/promises', () => ({ default: { lookup: (...a: unknown[]) => lookup(...a) } }));
vi.mock('@/lib/oauth/oauth-config-store', () => ({ clearOAuthConfigCache: vi.fn() }));
vi.mock('@/lib/observability/logger', () => ({ log: { oauth: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/observability/oauth-metrics', () => ({ recordClientRegistration: vi.fn() }));

const pinnedFetch = vi.fn();
vi.mock('@/lib/security/pinned-fetch', () => ({
  pinnedFetch: (...a: unknown[]) => pinnedFetch(...a),
  pinnedLookup: vi.fn(),
}));

const { registerOAuthClient } = await import('@/lib/oauth/dynamic-client-registration');

describe('registerOAuthClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pinnedFetch.mockResolvedValue(
      new Response(JSON.stringify({ client_id: 'x' }), { status: 201 })
    );
  });

  it.each([
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['loopback', 'http://127.0.0.1:8080/register'],
    ['RFC 1918', 'http://10.0.0.5/register'],
    ['IPv6 loopback', 'http://[::1]/register'],
    ['IPv4-mapped loopback', 'http://[::ffff:7f00:1]/register'],
  ])('refuses a registration endpoint pointing at %s', async (_label, endpoint) => {
    await expect(
      registerOAuthClient(endpoint, 'https://plugged.in/api/oauth/callback')
    ).rejects.toThrow();

    expect(pinnedFetch).not.toHaveBeenCalled();
  });

  it('refuses a public name that resolves inward', async () => {
    lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    await expect(
      registerOAuthClient('https://evil.example/register', 'https://plugged.in/api/oauth/callback')
    ).rejects.toThrow(/private or reserved/i);
  });

  it('still registers against a genuinely public endpoint', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

    const result = await registerOAuthClient(
      'https://auth.example.com/register',
      'https://plugged.in/api/oauth/callback'
    );

    expect(result.client_id).toBe('x');
    expect(pinnedFetch).toHaveBeenCalled();
  });
});
