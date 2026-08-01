/**
 * Opaque credential primitives for the OAuth authorization server.
 *
 * Opaque rather than JWT: revocation is a real requirement here (refresh-token
 * family revocation, user-initiated disconnect), and a single indexed lookup is
 * cheap. JWTs would make revocation a denylist problem.
 *
 * Nothing in this module touches the database, so it stays trivially testable.
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/** 32 bytes of CSPRNG output, base64url — 43 characters, no padding. */
export function mintCredential(): string {
  return randomBytes(32).toString('base64url');
}

export function hashCredential(credential: string): string {
  return createHash('sha256').update(credential, 'utf8').digest('hex');
}

/**
 * Timing-safe comparison of a presented credential against a stored hash.
 *
 * timingSafeEqual throws when the buffers differ in length, which a malformed
 * or truncated stored hash would trigger — so the length check comes first and
 * the whole thing is guarded.
 */
export function credentialsMatch(presented: string, storedHash: string): boolean {
  const presentedHash = Buffer.from(hashCredential(presented), 'hex');
  let stored: Buffer;
  try {
    stored = Buffer.from(storedHash, 'hex');
  } catch {
    return false;
  }
  if (stored.length !== presentedHash.length) return false;
  return timingSafeEqual(presentedHash, stored);
}

/**
 * Credential lifetimes.
 *
 * accessTokenMs is deliberately well clear of Claude's behaviour: it refreshes
 * reactively on 401 and proactively up to five minutes before expiry, so a
 * short-lived access token would produce constant refresh traffic.
 */
export const TTL = Object.freeze({
  authorizationCodeMs: 60_000,
  accessTokenMs: 3_600_000,
  refreshTokenMs: 2_592_000_000,
});
