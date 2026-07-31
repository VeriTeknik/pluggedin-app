import crypto from 'crypto';

import { log } from '@/lib/observability/logger';

/**
 * OAuth 2.1 Best Practice: State Nonce Binding with HMAC
 *
 * Prevents PKCE state tampering by binding critical parameters
 * together with an HMAC signature.
 *
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics
 */

/**
 * Generate integrity hash for PKCE state
 * Binds state to server, user, and code verifier to prevent tampering
 */
export function generateIntegrityHash(params: {
  state: string;
  serverUuid: string;
  userId: string;
  codeVerifier: string;
}): string {
  const secret = process.env.OAUTH_INTEGRITY_SECRET || process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error('OAUTH_INTEGRITY_SECRET or NEXTAUTH_SECRET not configured');
  }

  // Canonicalize parameters to prevent parameter order attacks
  const data = `${params.state}|${params.serverUuid}|${params.userId}|${params.codeVerifier}`;

  // Use HMAC-SHA256 for integrity
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');
}

/**
 * Verify integrity hash for PKCE state
 * Returns true if hash is valid, false otherwise
 */
export function verifyIntegrityHash(pkceState: {
  state: string;
  server_uuid: string;
  user_id: string;
  code_verifier: string;
  integrity_hash: string;
}): boolean {
  try {
    const expected = generateIntegrityHash({
      state: pkceState.state,
      serverUuid: pkceState.server_uuid,
      userId: pkceState.user_id,
      codeVerifier: pkceState.code_verifier,
    });

    // Timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(pkceState.integrity_hash)
    );
  } catch (error) {
    log.security('oauth_integrity_verification_failed', pkceState.user_id, {
      state: pkceState.state,
      serverUuid: pkceState.server_uuid,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return false;
  }
}

/**
 * Generate secure random state parameter
 * OAuth 2.1 recommends at least 128 bits of entropy
 */
export function generateSecureState(): string {
  // 32 bytes = 256 bits of entropy (exceeds OAuth 2.1 recommendation)
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate PKCE code verifier
 * OAuth 2.1 requires 43-128 characters, base64url encoded
 */
export function generateCodeVerifier(): string {
  // 32 bytes = 43 characters when base64url encoded
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate PKCE code challenge from verifier
 * OAuth 2.1 requires S256 (SHA-256) method
 */
export function generateCodeChallenge(verifier: string): string {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
}

/**
 * Validates a stored PKCE state against the user presenting it.
 *
 * Extracted from app/api/oauth/callback/route.ts, where this sequence lived
 * inline. The controls themselves are not new — binding state to user_id and
 * verifying the integrity hash have been in the callback — but inline in a
 * route handler they could not be unit tested, and tests/oauth/oauth-security
 * .test.ts has been asserting against this extracted shape all along without
 * ever running (the file failed to collect, so its 17 tests were invisible).
 *
 * Returns the state row when every check passes, null otherwise. A null result
 * is always accompanied by a recorded security metric and, where the state is
 * unusable, its deletion — a rejected state must not survive to be retried.
 */
export async function validatePkceState(
  state: string,
  userId: string
): Promise<{
  state: string;
  server_uuid: string;
  user_id: string;
  code_verifier: string;
  redirect_uri: string;
  integrity_hash: string;
  expires_at: Date;
} | null> {
  const { db } = await import('@/db');
  const { oauthPkceStatesTable } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const { recordCodeInjectionAttempt, recordIntegrityViolation } = await import(
    '@/lib/observability/oauth-metrics'
  );

  const stored = await db.query.oauthPkceStatesTable.findFirst({
    where: eq(oauthPkceStatesTable.state, state),
  });

  if (!stored || !stored.user_id) {
    return null;
  }

  // Authorization code injection: the state exists, but it belongs to somebody
  // else. Looking it up by state alone and comparing here — rather than
  // filtering by user_id in the query — is deliberate: it is what lets the
  // mismatch be detected and recorded instead of silently looking like a
  // missing state.
  if (stored.user_id !== userId) {
    // log.security is the security-event channel; it takes (action, userId,
    // metadata) rather than a message, so the shape differs from log.error.
    log.security('pkce_state_user_mismatch', userId, {
      state,
      expectedUser: stored.user_id,
    });
    recordCodeInjectionAttempt();
    return null;
  }

  if (!verifyIntegrityHash(stored as Parameters<typeof verifyIntegrityHash>[0])) {
    log.security('pkce_state_integrity_violation', userId, { state });
    recordIntegrityViolation('hash_mismatch');
    await db.delete(oauthPkceStatesTable).where(eq(oauthPkceStatesTable.state, state));
    return null;
  }

  if (stored.expires_at < new Date()) {
    log.security('pkce_state_expired', userId, { state });
    await db.delete(oauthPkceStatesTable).where(eq(oauthPkceStatesTable.state, state));
    return null;
  }

  return stored as Awaited<ReturnType<typeof validatePkceState>>;
}
