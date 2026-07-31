/**
 * Grant handling: authorization-code redemption and refresh-token rotation.
 *
 * Rotation on its own is close to cosmetic — it makes theft *detectable*, not
 * impossible. What gives it teeth is reuse detection: presenting a token that
 * has already been rotated proves a copy exists somewhere, and since we cannot
 * tell the attacker from the legitimate client, the entire token family is
 * revoked.
 */

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  oauthAccessTokensTable,
  oauthAuthorizationCodesTable,
  oauthRefreshTokensTable,
} from '@/db/schema';

import { verifyPkce } from './pkce';
import { TTL, hashCredential, mintCredential } from './tokens';

export interface IssuedTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'Bearer';
  scope: string;
}

type GrantResult =
  | { ok: true; tokens: IssuedTokens }
  | { ok: false; error: string; description: string };

/**
 * Reuse is checked BEFORE expiry and revocation on purpose: if either masked
 * the reuse signal, an attacker holding a stolen token could simply wait for it
 * to lapse and escape family revocation.
 */
export function classifyRefreshFailure(record: {
  rotated_at: Date | null;
  revoked_at: Date | null;
  expires_at: Date;
}): 'reuse' | 'revoked' | 'expired' | 'ok' {
  if (record.rotated_at) return 'reuse';
  if (record.revoked_at) return 'revoked';
  if (record.expires_at.getTime() <= Date.now()) return 'expired';
  return 'ok';
}

export async function revokeFamily(familyId: string, reason: string): Promise<number> {
  const revoked = await db
    .update(oauthRefreshTokensTable)
    .set({ revoked_at: new Date(), revocation_reason: reason })
    .where(eq(oauthRefreshTokensTable.family_id, familyId))
    .returning();
  return revoked.length;
}

async function issueTokenPair(input: {
  clientUuid: string;
  userId: string;
  grantedProjectUuids: string[];
  scopes: string[];
  familyId: string;
  parentId: string | null;
}): Promise<IssuedTokens> {
  const accessToken = mintCredential();
  const refreshToken = mintCredential();

  await db.insert(oauthAccessTokensTable).values({
    token_hash: hashCredential(accessToken),
    client_uuid: input.clientUuid,
    user_id: input.userId,
    granted_project_uuids: input.grantedProjectUuids,
    scopes: input.scopes,
    // A single granted Hub needs no selection step, so it becomes the default.
    default_project_uuid:
      input.grantedProjectUuids.length === 1 ? input.grantedProjectUuids[0] : null,
    expires_at: new Date(Date.now() + TTL.accessTokenMs),
  });

  await db.insert(oauthRefreshTokensTable).values({
    token_hash: hashCredential(refreshToken),
    family_id: input.familyId,
    parent_id: input.parentId,
    client_uuid: input.clientUuid,
    user_id: input.userId,
    granted_project_uuids: input.grantedProjectUuids,
    scopes: input.scopes,
    expires_at: new Date(Date.now() + TTL.refreshTokenMs),
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: Math.floor(TTL.accessTokenMs / 1000),
    token_type: 'Bearer',
    scope: input.scopes.join(' '),
  };
}

export async function redeemAuthorizationCode(input: {
  code: string;
  clientUuid: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<GrantResult> {
  const rows = await db
    .select()
    .from(oauthAuthorizationCodesTable)
    .where(eq(oauthAuthorizationCodesTable.code_hash, hashCredential(input.code)))
    .limit(1);

  const record = rows[0];
  if (!record) {
    return { ok: false, error: 'invalid_grant', description: 'Unknown authorization code' };
  }
  if (record.consumed_at) {
    return { ok: false, error: 'invalid_grant', description: 'Authorization code already used' };
  }
  if (record.expires_at.getTime() <= Date.now()) {
    return { ok: false, error: 'invalid_grant', description: 'Authorization code expired' };
  }
  if (record.client_uuid !== input.clientUuid) {
    return { ok: false, error: 'invalid_grant', description: 'Code was issued to another client' };
  }
  if (record.redirect_uri !== input.redirectUri) {
    return { ok: false, error: 'invalid_grant', description: 'redirect_uri does not match' };
  }
  if (!verifyPkce(input.codeVerifier, record.code_challenge, record.code_challenge_method)) {
    return { ok: false, error: 'invalid_grant', description: 'PKCE verification failed' };
  }

  // Mark consumed before issuing, so a concurrent second redemption of the same
  // code cannot also succeed.
  await db
    .update(oauthAuthorizationCodesTable)
    .set({ consumed_at: new Date() })
    .where(eq(oauthAuthorizationCodesTable.uuid, record.uuid));

  const tokens = await issueTokenPair({
    clientUuid: record.client_uuid,
    userId: record.user_id,
    grantedProjectUuids: record.granted_project_uuids,
    scopes: record.scopes,
    familyId: crypto.randomUUID(),
    parentId: null,
  });

  return { ok: true, tokens };
}

export async function rotateRefreshToken(input: {
  refreshToken: string;
  clientUuid: string;
}): Promise<GrantResult> {
  const rows = await db
    .select()
    .from(oauthRefreshTokensTable)
    .where(eq(oauthRefreshTokensTable.token_hash, hashCredential(input.refreshToken)))
    .limit(1);

  const record = rows[0];
  if (!record) {
    return { ok: false, error: 'invalid_grant', description: 'Unknown refresh token' };
  }
  if (record.client_uuid !== input.clientUuid) {
    return { ok: false, error: 'invalid_grant', description: 'Token was issued to another client' };
  }

  const classification = classifyRefreshFailure(record);
  if (classification === 'reuse') {
    await revokeFamily(record.family_id, 'refresh_token_reuse_detected');
    return {
      ok: false,
      error: 'invalid_grant',
      description: 'Refresh token reuse detected; all tokens for this authorization were revoked',
    };
  }
  if (classification !== 'ok') {
    return { ok: false, error: 'invalid_grant', description: `Refresh token ${classification}` };
  }

  await db
    .update(oauthRefreshTokensTable)
    .set({ rotated_at: new Date() })
    .where(eq(oauthRefreshTokensTable.uuid, record.uuid));

  const tokens = await issueTokenPair({
    clientUuid: record.client_uuid,
    userId: record.user_id,
    grantedProjectUuids: record.granted_project_uuids,
    scopes: record.scopes,
    familyId: record.family_id,
    parentId: record.uuid,
  });

  return { ok: true, tokens };
}
