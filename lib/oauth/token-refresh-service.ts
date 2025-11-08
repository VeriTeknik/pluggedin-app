import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { mcpServerOAuthTokensTable, mcpServersTable } from '@/db/schema';
import { decryptField, encryptField } from '@/lib/encryption';
import { getOAuthConfig } from '@/lib/oauth/oauth-config-store';

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
 */
export async function refreshOAuthToken(serverUuid: string): Promise<boolean> {
  console.log('[OAuth Refresh] Checking token for server:', serverUuid);

  // 1. Get stored OAuth tokens
  const tokenRecord = await db.query.mcpServerOAuthTokensTable.findFirst({
    where: eq(mcpServerOAuthTokensTable.server_uuid, serverUuid)
  });

  if (!tokenRecord?.refresh_token_encrypted) {
    console.log('[OAuth Refresh] No refresh token available for server:', serverUuid);
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

  try {
    // 5. Exchange refresh token for new access token
    const tokenResponse = await fetch(oauthConfig.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: oauthConfig.client_id,
        // Add client_secret if required (for confidential clients)
        ...(oauthConfig.client_secret ? { client_secret: oauthConfig.client_secret } : {})
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[OAuth Refresh] Failed to refresh token:', errorText);
      return false;
    }

    const newTokens = await tokenResponse.json();
    console.log('[OAuth Refresh] Successfully received new tokens');

    // 6. Update mcpServerOAuthTokensTable with new tokens
    const newAccessTokenEncrypted = encryptField(newTokens.access_token);
    const newRefreshTokenEncrypted = newTokens.refresh_token
      ? encryptField(newTokens.refresh_token)
      : tokenRecord.refresh_token_encrypted; // Keep old refresh token if not provided

    const newExpiresAt = newTokens.expires_in
      ? new Date(Date.now() + newTokens.expires_in * 1000)
      : null;

    await db.update(mcpServerOAuthTokensTable)
      .set({
        access_token_encrypted: newAccessTokenEncrypted,
        refresh_token_encrypted: newRefreshTokenEncrypted,
        expires_at: newExpiresAt,
        updated_at: new Date(),
      })
      .where(eq(mcpServerOAuthTokensTable.server_uuid, serverUuid));

    // 7. Update streamable_http_options_encrypted with new token
    const server = await db.query.mcpServersTable.findFirst({
      where: eq(mcpServersTable.uuid, serverUuid)
    });

    if (server?.streamable_http_options_encrypted) {
      const options = decryptField(server.streamable_http_options_encrypted) as Record<string, any>;
      options.headers = {
        ...(options.headers || {}),
        Authorization: `${newTokens.token_type || 'Bearer'} ${newTokens.access_token}`,
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
 */
export async function validateAndRefreshToken(serverUuid: string): Promise<boolean> {
  // Check if token is expired
  const expired = await isTokenExpired(serverUuid);

  if (!expired) {
    return true; // Token is still valid
  }

  // Try to refresh the token
  console.log('[OAuth] Token expired or expiring soon, attempting refresh...');
  return await refreshOAuthToken(serverUuid);
}