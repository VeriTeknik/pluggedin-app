import { describe, expect, it } from 'vitest';
import { SUPPORTED_CHALLENGE_METHODS, verifyPkce } from '@/lib/oauth/pkce';

// RFC 7636 Appendix B
const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('PKCE S256', () => {
  it('verifies the RFC 7636 test vector', () => {
    expect(verifyPkce(RFC_VERIFIER, RFC_CHALLENGE, 'S256')).toBe(true);
  });

  it('rejects a wrong verifier', () => {
    expect(verifyPkce('wrong-verifier-value-padded-to-length', RFC_CHALLENGE, 'S256')).toBe(false);
  });

  it('rejects the plain method outright', () => {
    // OAuth 2.1 removes `plain`; accepting it would silently weaken every flow.
    expect(verifyPkce(RFC_VERIFIER, RFC_VERIFIER, 'plain')).toBe(false);
  });

  it('rejects an unknown method', () => {
    expect(verifyPkce(RFC_VERIFIER, RFC_CHALLENGE, 'S512')).toBe(false);
  });

  it('rejects empty input without throwing', () => {
    expect(verifyPkce('', RFC_CHALLENGE, 'S256')).toBe(false);
    expect(verifyPkce(RFC_VERIFIER, '', 'S256')).toBe(false);
  });

  it('advertises S256 only', () => {
    expect(SUPPORTED_CHALLENGE_METHODS).toEqual(['S256']);
  });
});
