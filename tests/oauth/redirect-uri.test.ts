import { describe, expect, it } from 'vitest';
import {
  CLAUDE_HOSTED_REDIRECT_URI,
  isLoopbackRedirect,
  redirectUriMatches,
} from '@/lib/oauth/redirect-uri';

describe('exact matching for non-loopback URIs', () => {
  it('accepts an identical https URI', () => {
    expect(
      redirectUriMatches(CLAUDE_HOSTED_REDIRECT_URI, CLAUDE_HOSTED_REDIRECT_URI)
    ).toBe(true);
  });

  it('rejects a different path on the same host', () => {
    expect(
      redirectUriMatches('https://claude.ai/api/mcp/other', CLAUDE_HOSTED_REDIRECT_URI)
    ).toBe(false);
  });

  it('rejects a different host', () => {
    expect(
      redirectUriMatches('https://evil.example/api/mcp/auth_callback', CLAUDE_HOSTED_REDIRECT_URI)
    ).toBe(false);
  });

  it('does not let an https registration match on port alone', () => {
    expect(
      redirectUriMatches('https://claude.ai:8443/api/mcp/auth_callback', CLAUDE_HOSTED_REDIRECT_URI)
    ).toBe(false);
  });
});

describe('loopback matching ignores the port', () => {
  // Claude Code binds an ephemeral port and declares the port-less form in its
  // CIMD, so both 127.0.0.1 (RFC 8252 s7.3) and localhost must match any port.
  it('matches 127.0.0.1 on any port', () => {
    expect(redirectUriMatches('http://127.0.0.1:3118/callback', 'http://127.0.0.1/callback')).toBe(true);
    expect(redirectUriMatches('http://127.0.0.1:51234/callback', 'http://127.0.0.1/callback')).toBe(true);
  });

  it('matches localhost on any port', () => {
    expect(redirectUriMatches('http://localhost:3118/callback', 'http://localhost/callback')).toBe(true);
  });

  it('still requires the path to match', () => {
    expect(redirectUriMatches('http://127.0.0.1:3118/evil', 'http://127.0.0.1/callback')).toBe(false);
  });

  it('does not treat a non-loopback host as loopback', () => {
    expect(redirectUriMatches('http://192.168.1.5:3118/callback', 'http://127.0.0.1/callback')).toBe(false);
    expect(redirectUriMatches('http://notlocalhost:3118/callback', 'http://localhost/callback')).toBe(false);
  });

  it('identifies loopback URIs for the consent-screen warning', () => {
    expect(isLoopbackRedirect('http://127.0.0.1/callback')).toBe(true);
    expect(isLoopbackRedirect('http://localhost:1234/callback')).toBe(true);
    expect(isLoopbackRedirect('http://[::1]/callback')).toBe(true);
    expect(isLoopbackRedirect(CLAUDE_HOSTED_REDIRECT_URI)).toBe(false);
  });

  it('returns false on unparseable input rather than throwing', () => {
    expect(redirectUriMatches('not a uri', CLAUDE_HOSTED_REDIRECT_URI)).toBe(false);
    expect(isLoopbackRedirect('not a uri')).toBe(false);
  });
});
