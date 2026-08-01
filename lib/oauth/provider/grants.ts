/**
 * Grant handling: authorization-code redemption and refresh-token rotation.
 *
 * Rotation on its own is close to cosmetic — it makes theft *detectable*, not
 * impossible. What gives it teeth is reuse detection: presenting a token that
 * has already been rotated proves a copy exists somewhere, and since we cannot
 * tell the attacker from the legitimate client, the entire token family is
 * revoked.
 */

import { and, eq, isNull } from 'drizzle-orm';

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
/**
 * Either the pool or a transaction handle. Functions that must run inside a
 * caller's transaction take one of these rather than reaching for `db`.
 */
type DbExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

/**
 * Revokes every credential descended from one authorization.
 *
 * Both tables, not just the refresh chain. Revoking refresh tokens alone leaves
 * the access tokens issued from them valid until they expire — up to an hour of
 * continued access *after* the compromise was detected, which would defeat most
 * of the point of detecting it.
 *
 * Which is exactly why the two updates share a transaction. Sequentially, a
 * failure on the second one produces that same half-revoked state by accident:
 * refresh chain dead, access tokens live, and the caller told how many rows it
 * revoked as though it had succeeded. The usual trigger for this function is
 * detected refresh-token reuse, so the moment it matters most is the moment the
 * database is least worth trusting to stay up.
 */
export async function revokeFamily(
  familyId: string,
  reason: string,
  executor?: DbExecutor
): Promise<number> {
  // When the caller already holds a transaction we join it instead of opening
  // another. Opening one would take a second connection from the pool while the
  // caller's is still held, which is how a revocation triggered mid-rotation
  // deadlocks under load.
  if (executor) return revokeFamilyWith(executor, familyId, reason);
  return db.transaction((tx) => revokeFamilyWith(tx, familyId, reason));
}

async function revokeFamilyWith(
  tx: DbExecutor,
  familyId: string,
  reason: string
): Promise<number> {
  const now = new Date();

  {
    const revokedRefresh = await tx
      .update(oauthRefreshTokensTable)
      .set({ revoked_at: now, revocation_reason: reason })
      .where(eq(oauthRefreshTokensTable.family_id, familyId))
      .returning();

    const revokedAccess = await tx
      .update(oauthAccessTokensTable)
      .set({ revoked_at: now })
      .where(eq(oauthAccessTokensTable.family_id, familyId))
      .returning();

    return revokedRefresh.length + revokedAccess.length;
  }
}

/**
 * The two inserts always share a transaction. The caller passes the executor so
 * that the claim which authorises the issuance — consuming an authorization
 * code, or marking a refresh token rotated — can share it too. Issuing tokens
 * atomically but claiming separately just moves the unrecoverable state one
 * step earlier: the code is spent, no tokens exist, and the client has nothing
 * left to retry with.
 */
async function issueTokenPair(
  input: {
    clientUuid: string;
    userId: string;
    grantedProjectUuids: string[];
    scopes: string[];
    familyId: string;
    parentId: string | null;
  },
  tx: DbExecutor
): Promise<IssuedTokens> {
  const accessToken = mintCredential();
  const refreshToken = mintCredential();

  {
    await tx.insert(oauthAccessTokensTable).values({
      token_hash: hashCredential(accessToken),
      family_id: input.familyId,
      client_uuid: input.clientUuid,
      user_id: input.userId,
      granted_project_uuids: input.grantedProjectUuids,
      scopes: input.scopes,
      // A single granted Hub needs no selection step, so it becomes the default.
      default_project_uuid:
        input.grantedProjectUuids.length === 1
          ? input.grantedProjectUuids[0]
          : null,
      expires_at: new Date(Date.now() + TTL.accessTokenMs),
    });

    await tx.insert(oauthRefreshTokensTable).values({
      token_hash: hashCredential(refreshToken),
      family_id: input.familyId,
      parent_id: input.parentId,
      client_uuid: input.clientUuid,
      user_id: input.userId,
      granted_project_uuids: input.grantedProjectUuids,
      scopes: input.scopes,
      expires_at: new Date(Date.now() + TTL.refreshTokenMs),
    });
  }

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
    .where(
      eq(oauthAuthorizationCodesTable.code_hash, hashCredential(input.code))
    )
    .limit(1);

  const record = rows[0];
  if (!record) {
    return {
      ok: false,
      error: 'invalid_grant',
      description: 'Unknown authorization code',
    };
  }
  if (record.consumed_at) {
    return {
      ok: false,
      error: 'invalid_grant',
      description: 'Authorization code already used',
    };
  }
  if (record.expires_at.getTime() <= Date.now()) {
    return {
      ok: false,
      error: 'invalid_grant',
      description: 'Authorization code expired',
    };
  }
  if (record.client_uuid !== input.clientUuid) {
    return {
      ok: false,
      error: 'invalid_grant',
      description: 'Code was issued to another client',
    };
  }
  if (record.redirect_uri !== input.redirectUri) {
    return {
      ok: false,
      error: 'invalid_grant',
      description: 'redirect_uri does not match',
    };
  }
  if (
    !verifyPkce(
      input.codeVerifier,
      record.code_challenge,
      record.code_challenge_method
    )
  ) {
    return {
      ok: false,
      error: 'invalid_grant',
      description: 'PKCE verification failed',
    };
  }

  // Claim the code atomically. The checks above are advisory: between the SELECT
  // and this write, a concurrent request could pass exactly the same checks and
  // both would issue tokens. Making consumption a single conditional UPDATE and
  // reading how many rows it touched is what actually makes redemption
  // single-use — whoever's UPDATE lands first gets the row, the other gets none.
  // Claiming the code and issuing against it are one unit. Split, a failure
  // during issuance leaves the code consumed and no tokens anywhere: the client
  // cannot retry, because a second redemption is correctly refused as reuse.
  // The user has to walk the whole authorization flow again.
  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(oauthAuthorizationCodesTable)
      .set({ consumed_at: new Date() })
      .where(
        and(
          eq(oauthAuthorizationCodesTable.uuid, record.uuid),
          isNull(oauthAuthorizationCodesTable.consumed_at)
        )
      )
      .returning();

    if (claimed.length === 0) {
      return {
        ok: false,
        error: 'invalid_grant',
        description: 'Authorization code already used',
      };
    }

    return {
      ok: true,
      tokens: await issueTokenPair(
        {
          clientUuid: record.client_uuid,
          userId: record.user_id,
          grantedProjectUuids: record.granted_project_uuids,
          scopes: record.scopes,
          familyId: crypto.randomUUID(),
          parentId: null,
        },
        tx
      ),
    };
  });
}

export async function rotateRefreshToken(input: {
  refreshToken: string;
  clientUuid: string;
}): Promise<GrantResult> {
  const rows = await db
    .select()
    .from(oauthRefreshTokensTable)
    .where(
      eq(oauthRefreshTokensTable.token_hash, hashCredential(input.refreshToken))
    )
    .limit(1);

  const record = rows[0];
  if (!record) {
    return {
      ok: false,
      error: 'invalid_grant',
      description: 'Refresh token is not valid',
    };
  }

  // A refresh token presented by a client it was not issued to is not a boring
  // validation failure — it is the clearest evidence available that the token
  // has left the client that holds it. Rejecting without revoking let an
  // attacker confirm a stolen token was live without tripping the control that
  // exists to contain exactly that, then choose their moment: client_id is
  // public, so the correct one is always available when they want it.
  //
  // Revocation needs possession of a real refresh token, so this cannot be
  // driven by guessing — an unknown hash never reaches here.
  if (record.client_uuid !== input.clientUuid) {
    await revokeFamily(record.family_id, 'refresh_token_wrong_client');
    return {
      ok: false,
      error: 'invalid_grant',
      description: 'Refresh token is not valid',
    };
  }

  const classification = classifyRefreshFailure(record);
  if (classification === 'reuse') {
    await revokeFamily(record.family_id, 'refresh_token_reuse_detected');
    return {
      ok: false,
      error: 'invalid_grant',
      description:
        'Refresh token reuse detected; all tokens for this authorization were revoked',
    };
  }
  if (classification !== 'ok') {
    return {
      ok: false,
      error: 'invalid_grant',
      description: `Refresh token ${classification}`,
    };
  }

  // Same atomicity requirement as code redemption: two concurrent refreshes
  // could both read an unrotated token and both issue a pair. Claiming the
  // rotation conditionally means the loser is treated as what it is — a second
  // use of an already-rotated token, i.e. exactly the reuse signal.
  // Same unit as code redemption: claim, then issue against the claim. A
  // failure between them would spend the refresh token and hand back nothing,
  // and the client's retry would look like reuse — revoking the whole family
  // over a transient database error.
  return db.transaction(async (tx) => {
    const rotated = await tx
      .update(oauthRefreshTokensTable)
      .set({ rotated_at: new Date() })
      .where(
        and(
          eq(oauthRefreshTokensTable.uuid, record.uuid),
          isNull(oauthRefreshTokensTable.rotated_at)
        )
      )
      .returning();

    if (rotated.length === 0) {
      // Revoked on the caller's transaction: this commits, since losing the
      // claim is a real reuse signal rather than an error to roll back.
      await revokeFamily(record.family_id, 'refresh_token_reuse_detected', tx);
      return {
        ok: false,
        error: 'invalid_grant',
        description:
          'Refresh token reuse detected; all tokens for this authorization were revoked',
      };
    }

    return {
      ok: true,
      tokens: await issueTokenPair(
        {
          clientUuid: record.client_uuid,
          userId: record.user_id,
          grantedProjectUuids: record.granted_project_uuids,
          scopes: record.scopes,
          familyId: record.family_id,
          parentId: record.uuid,
        },
        tx
      ),
    };
  });
}
