import crypto from 'crypto';

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
    console.error('[OAuth Integrity] Hash verification failed:', error);
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
