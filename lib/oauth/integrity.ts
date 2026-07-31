import crypto from 'crypto';

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { oauthPkceStatesTable } from '@/db/schema';
import { log } from '@/lib/observability/logger';
import {
  recordCodeInjectionAttempt,
  recordIntegrityViolation,
  recordPkceValidation,
} from '@/lib/observability/oauth-metrics';

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

/** Exactly the fields the integrity hash commits to, plus the hash itself. */
export interface HashedPkceFields {
  state: string;
  server_uuid: string;
  user_id: string;
  code_verifier: string;
  integrity_hash: string;
}

/**
 * Verify integrity hash for PKCE state
 * Returns true if hash is valid, false otherwise
 */
export function verifyIntegrityHash(pkceState: HashedPkceFields): boolean {
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
 * Returns the state row when every check passes. On failure it returns a reason
 * rather than a bare null: the callback distinguishes an expired state from an
 * invalid one in its metrics and in the error it shows the user, and collapsing
 * both into null would quietly drop that distinction.
 *
 * Every failure records a metric, and the ones that leave the state unusable
 * delete it — a rejected state must not survive to be retried.
 */
export type PkceValidationFailure = 'not_found' | 'user_mismatch' | 'integrity' | 'expired';

export interface PkceStateRow extends HashedPkceFields {
  redirect_uri: string;
  expires_at: Date;
}

export async function validatePkceState(
  state: string,
  userId: string
): Promise<
  { ok: true; state: PkceStateRow } | { ok: false; reason: PkceValidationFailure }
> {
  const stored = await db.query.oauthPkceStatesTable.findFirst({
    where: eq(oauthPkceStatesTable.state, state),
  });

  if (!stored || !stored.user_id) {
    recordPkceValidation(false, 'not_found');
    return { ok: false, reason: 'not_found' };
  }

  // The column is nullable but the guard above has just proven this row's
  // user_id is set. Rebuilding the value carries that proof into the type,
  // where a cast would only have hidden the nullability from the compiler.
  const row: PkceStateRow = { ...stored, user_id: stored.user_id };

  // Authorization code injection: the state exists, but it belongs to somebody
  // else. Looking it up by state alone and comparing here — rather than
  // filtering by user_id in the query — is deliberate: it is what lets the
  // mismatch be detected and recorded instead of silently looking like a
  // missing state.
  if (row.user_id !== userId) {
    // log.security is the security-event channel; it takes (action, userId,
    // metadata) rather than a message, so the shape differs from log.error.
    log.security('pkce_state_user_mismatch', userId, {
      state,
      expectedUser: row.user_id,
    });
    recordCodeInjectionAttempt();
    recordPkceValidation(false, 'user_mismatch');
    return { ok: false, reason: 'user_mismatch' };
  }

  if (!verifyIntegrityHash(row)) {
    log.security('pkce_state_integrity_violation', userId, { state });
    recordIntegrityViolation('hash_mismatch');
    recordPkceValidation(false, 'integrity');
    await db.delete(oauthPkceStatesTable).where(eq(oauthPkceStatesTable.state, state));
    return { ok: false, reason: 'integrity' };
  }

  if (row.expires_at < new Date()) {
    log.security('pkce_state_expired', userId, { state });
    recordPkceValidation(false, 'expired');
    await db.delete(oauthPkceStatesTable).where(eq(oauthPkceStatesTable.state, state));
    return { ok: false, reason: 'expired' };
  }

  recordPkceValidation(true);
  return { ok: true, state: row };
}
