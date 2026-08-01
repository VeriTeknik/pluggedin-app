/**
 * PKCE state creation for outbound OAuth flows.
 *
 * This is the *client* half of PKCE: when pluggedin-app connects to a
 * downstream MCP server it starts an authorization code flow, and the verifier
 * has to be stored somewhere until the callback returns. That store is
 * oauth_pkce_states, and every row is bound to the user who started the flow —
 * the binding is what makes authorization code injection detectable in
 * validatePkceState().
 *
 * Extracted so it can be unit tested; tests/oauth/oauth-security.test.ts has
 * been asserting against this shape without ever running.
 */

import { randomBytes } from 'crypto';

import { generateIntegrityHash } from './integrity';

/** OAuth 2.1 recommends a short window; five minutes matches the callback. */
const STATE_TTL_MS = 300_000;

export interface PkceState {
  state: string;
  server_uuid: string;
  user_id: string;
  code_verifier: string;
  redirect_uri: string;
  expires_at: Date;
}

/**
 * Creates and stores a PKCE state for an outbound authorization request.
 *
 * user_id is not optional here even though the column is nullable: a state with
 * no owner cannot be validated against the caller at callback time, which is
 * precisely the check that stops one user redeeming another's code.
 */
export async function createPkceState(
  serverUuid: string,
  userId: string,
  redirectUri: string
): Promise<PkceState> {
  const { db } = await import('@/db');
  const { oauthPkceStatesTable } = await import('@/db/schema');

  const state = randomBytes(32).toString('base64url');
  const codeVerifier = randomBytes(32).toString('base64url');

  const integrityHash = generateIntegrityHash({
    state,
    serverUuid,
    userId,
    codeVerifier,
  });

  const inserted = await db
    .insert(oauthPkceStatesTable)
    .values({
      state,
      server_uuid: serverUuid,
      user_id: userId,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      integrity_hash: integrityHash,
      expires_at: new Date(Date.now() + STATE_TTL_MS),
    })
    .returning();

  return inserted[0] as PkceState;
}
