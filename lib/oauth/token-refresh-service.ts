import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { mcpServerOAuthTokensTable, mcpServersTable, profilesTable, projectsTable } from '@/db/schema';
import { decryptField, encryptField } from '@/lib/encryption';
import { getOAuthConfig } from '@/lib/oauth/oauth-config-store';

/**
 * P0 Security: Validates that the server belongs to the specified user
 * Prevents token substitution attacks where stolen tokens are used on attacker's servers
 */
async function validateServerOwnership(serverUuid: string, userId: string): Promise<boolean> {
  const server = await db
    .select({
      profile_uuid: mcpServersTable.profile_uuid
    })
    .from(mcpServersTable)
    .where(eq(mcpServersTable.uuid, serverUuid))
    .limit(1);

  if (!server.length) {
    console.error('[OAuth Security] Server not found:', serverUuid);
    return false;
  }

  // Traverse: Server → Profile → Project → User
  const profile = await db
    .select({
      project_uuid: profilesTable.project_uuid
    })
    .from(profilesTable)
    .where(eq(profilesTable.uuid, server[0].profile_uuid))
    .limit(1);

  if (!profile.length) {
    console.error('[OAuth Security] Profile not found for server:', serverUuid);
    return false;
  }

  const project = await db
    .select({
      user_id: projectsTable.user_id
    })
    .from(projectsTable)
    .where(eq(projectsTable.uuid, profile[0].project_uuid))
    .limit(1);

  if (!project.length || project[0].user_id !== userId) {
    console.error('[OAuth Security] Server does not belong to user. Server:', serverUuid, 'User:', userId);
    return false;
  }

  return true;
}

/**
 * Checks if a token is expired or will expire soon
 */
export async function isTokenExpired(serverUuid: string): Promise<boolean> {
  const tokenRecord = await db.query.mcpServerOAuthTokensTable.findFirst({
    where: eq(mcpServerOAuthTokensTable.server_uuid, serverUuid)
  });

  if (!tokenRecord?.expires_at) {
    return false; // No expiration, assume valid (permanent token)
  }

  // Check if expired or will expire within 5 minutes
  const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
  return tokenRecord.expires_at.getTime() < (Date.now() + bufferTime);
}

/**
 * Refreshes an OAuth token using the stored refresh token
 * P0 Security: Validates server ownership to prevent token substitution attacks
 */
export async function refreshOAuthToken(serverUuid: string, userId: string): Promise<boolean> {
  console.log('[OAuth Refresh] Checking token for server:', serverUuid);

  // P0 Security: Validate server belongs to user (prevents token substitution)
  const isOwner = await validateServerOwnership(serverUuid, userId);
  if (!isOwner) {
    console.error('[OAuth Refresh] Server ownership validation failed. User:', userId, 'Server:', serverUuid);
    return false;
  }

  // 1. Get stored OAuth tokens
  const tokenRecord = await db.query.mcpServerOAuthTokensTable.findFirst({
    where: eq(mcpServerOAuthTokensTable.server_uuid, serverUuid)
  });

  if (!tokenRecord?.refresh_token_encrypted) {
    console.log('[OAuth Refresh] No refresh token available for server:', serverUuid);
    return false;
  }

  // OAuth 2.1: Check for refresh token reuse (security measure)
  if (tokenRecord.refresh_token_used_at) {
    console.error('[OAuth Security] Refresh token reuse detected! Revoking all tokens for server:', serverUuid);
    // Revoke all tokens as a security measure (OAuth 2.1 best practice)
    await db.delete(mcpServerOAuthTokensTable)
      .where(eq(mcpServerOAuthTokensTable.server_uuid, serverUuid));
    return false;
  }

  // 2. Check if token actually needs refresh
  const now = Date.now();
  const expiresAt = tokenRecord.expires_at?.getTime() || 0;
  const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

  if (expiresAt > now + bufferTime) {
    console.log('[OAuth Refresh] Token still valid, no refresh needed');
    return true; // Token still valid
  }

  // 3. Get OAuth configuration
  const oauthConfig = await getOAuthConfig(serverUuid);
  if (!oauthConfig?.token_endpoint) {
    console.error('[OAuth Refresh] No OAuth config or token endpoint found');
    return false;
  }

  // 4. Decrypt and use refresh token
  const refreshToken = decryptField(tokenRecord.refresh_token_encrypted);

  console.log('[OAuth Refresh] Exchanging refresh token at:', oauthConfig.token_endpoint);

  // OAuth 2.1: Mark refresh token as used BEFORE making request (prevents concurrent reuse)
  try {
    await db.update(mcpServerOAuthTokensTable)
      .set({
        refresh_token_used_at: new Date(),
      })
      .where(eq(mcpServerOAuthTokensTable.server_uuid, serverUuid));
    console.log('[OAuth 2.1] Marked refresh token as used');
  } catch (error) {
    console.error('[OAuth 2.1] Failed to mark token as used:', error);
    return false;
  }

  try {
    // 5. Exchange refresh token for new access token
    // P0 Security: Use HTTP Basic Auth per RFC 6749 Section 2.3.1 (prevents credential logging)
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    };

    // Build request body WITHOUT client_secret
    const tokenParams = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: oauthConfig.client_id || '', // Fallback to empty string for type safety
    });

    // For confidential clients: Use HTTP Basic Authentication (RFC 6749 Section 2.3.1)
    if (oauthConfig.client_secret_encrypted) {
      const clientSecret = decryptField(oauthConfig.client_secret_encrypted);
      const credentials = Buffer.from(`${oauthConfig.client_id}:${clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
      console.log('[OAuth Refresh] Using HTTP Basic Authentication for confidential client');
    }

    const tokenResponse = await fetch(oauthConfig.token_endpoint, {
      method: 'POST',
      headers,
      body: tokenParams,
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[OAuth Refresh] Failed to refresh token:', errorText);
      return false;
    }

    const newTokens = await tokenResponse.json();
    console.log('[OAuth Refresh] Successfully received new tokens');

    // 6. Update mcpServerOAuthTokensTable with new tokens (OAuth 2.1: Token Rotation)
    const newAccessTokenEncrypted = encryptField(newTokens.access_token);

    // OAuth 2.1: REQUIRE new refresh token (rotation)
    // If OAuth server doesn't provide new refresh token, keep old one but mark as rotated
    const newRefreshTokenEncrypted = newTokens.refresh_token
      ? encryptField(newTokens.refresh_token)
      : tokenRecord.refresh_token_encrypted;

    const newExpiresAt = newTokens.expires_in
      ? new Date(Date.now() + newTokens.expires_in * 1000)
      : null;

    // OAuth 2.1: Store new tokens and clear refresh_token_used_at (fresh token)
    await db.update(mcpServerOAuthTokensTable)
      .set({
        access_token_encrypted: newAccessTokenEncrypted,
        refresh_token_encrypted: newRefreshTokenEncrypted,
        expires_at: newExpiresAt,
        refresh_token_used_at: null, // OAuth 2.1: Clear used flag for new token
        updated_at: new Date(),
      })
      .where(eq(mcpServerOAuthTokensTable.server_uuid, serverUuid));

    console.log('[OAuth 2.1] Token rotation complete - new tokens stored');

    // 7. Update streamable_http_options_encrypted with new token
    const server = await db.query.mcpServersTable.findFirst({
      where: eq(mcpServersTable.uuid, serverUuid)
    });

    if (server?.streamable_http_options_encrypted) {
      const options = decryptField(server.streamable_http_options_encrypted) as Record<string, any>;

      // Normalize token_type to RFC 6750 spec (capitalize first letter)
      const tokenType = newTokens.token_type
        ? newTokens.token_type.charAt(0).toUpperCase() + newTokens.token_type.slice(1).toLowerCase()
        : 'Bearer';

      options.headers = {
        ...(options.headers || {}),
        Authorization: `${tokenType} ${newTokens.access_token}`,
      };

      const encryptedOptions = encryptField(options);
      await db.update(mcpServersTable)
        .set({
          streamable_http_options_encrypted: encryptedOptions,
        })
        .where(eq(mcpServersTable.uuid, serverUuid));

      console.log('[OAuth Refresh] Updated streamable_http_options with new token');
    }

    console.log('[OAuth Refresh] Successfully refreshed token for server:', serverUuid);
    return true;

  } catch (error) {
    console.error('[OAuth Refresh] Error during token refresh:', error);
    return false;
  }
}

/**
 * Validates and refreshes OAuth tokens if needed
 * Called before making MCP requests
 * P0 Security: Validates server ownership to prevent token substitution attacks
 */
export async function validateAndRefreshToken(serverUuid: string, userId: string): Promise<boolean> {
  // P0 Security: Validate server belongs to user (prevents token substitution)
  const isOwner = await validateServerOwnership(serverUuid, userId);
  if (!isOwner) {
    console.error('[OAuth] Server ownership validation failed. User:', userId, 'Server:', serverUuid);
    return false;
  }

  // Check if token is expired
  const expired = await isTokenExpired(serverUuid);

  if (!expired) {
    return true; // Token is still valid
  }

  // Try to refresh the token
  console.log('[OAuth] Token expired or expiring soon, attempting refresh...');
  return await refreshOAuthToken(serverUuid, userId);
}