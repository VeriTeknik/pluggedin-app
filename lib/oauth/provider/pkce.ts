/**
 * PKCE verification (RFC 7636), S256 only.
 *
 * Claude sends a code_challenge with code_challenge_method=S256 on every
 * authorization request regardless of how the client registered, so S256 is not
 * optional for us. OAuth 2.1 removes the `plain` method, and accepting it would
 * silently weaken every flow — so it is rejected explicitly rather than by
 * omission.
 */

import { createHash, timingSafeEqual } from 'crypto';

export const SUPPORTED_CHALLENGE_METHODS = ['S256'] as const;

export function verifyPkce(verifier: string, challenge: string, method: string): boolean {
  if (method !== 'S256') return false;
  if (!verifier || !challenge) return false;

  const computed = createHash('sha256').update(verifier, 'ascii').digest('base64url');
  const a = Buffer.from(computed, 'utf8');
  const b = Buffer.from(challenge, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
