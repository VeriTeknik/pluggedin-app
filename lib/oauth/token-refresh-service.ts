import { and, eq, isNull, lt, or } from 'drizzle-orm';

import { db } from '@/db';
import { mcpServerOAuthTokensTable, mcpServersTable, profilesTable, projectsTable } from '@/db/schema';
import { decryptField, encryptField } from '@/lib/encryption';
import { getOAuthConfig } from '@/lib/oauth/oauth-config-store';
import { log } from '@/lib/observability/logger';
import {
  recordTokenRefresh,
  recordTokenReuseDetected,
  recordTokenRevocation,
} from '@/lib/observability/oauth-metrics';

/**
 * Standardized OAuth audit logging helper
 * Logs to both console (for journalctl/stdout) and structured logger
 */
function oauthAudit(
  event: string,
  details: Record<string, any>,
  level: 'info' | 'error' = 'info'
) {
  const payload = { timestamp: new Date().toISOString(), ...details };
  if (level === 'error') {
    console.error(`[OAuth Token Lifecycle] ${event}:`, payload);
  } else {
    console.log(`[OAuth Token Lifecycle] ${event}:`, payload);
  }
}

/**
 * Waits for a concurrent token refresh to complete
 * Uses polling with exponential backoff to check if the lock is cleared
 *
 * @param serverUuid - The server UUID being refreshed
 * @param initialLockAge - Age of the lock when first detected (ms)
 * @returns true if refresh completed successfully, false if timeout or error
 */
async function waitForRefreshCompletion(serverUuid: string, initialLockAge: number): Promise<boolean> {
  const maxWaitTime = 15 * 1000; // 15 seconds max wait (10s fetch timeout + 5s buffer)
  const startTime = Date.now();
  let pollInterval = 100; // Start with 100ms
  const maxPollInterval = 2000; // Max 2 seconds between polls

  log.oauth('token_refresh_wait_started', {
    serverUuid,
    initialLockAge,
    maxWaitTime
  });

  while ((Date.now() - startTime) < maxWaitTime) {
    // Wait before polling
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    // Check if lock is cleared
    const tokenRecord = await db.query.mcpServerOAuthTokensTable.findFirst({
      where: eq(mcpServerOAuthTokensTable.server_uuid, serverUuid)
    });

    if (!tokenRecord) {
      log.oauth('token_refresh_wait_no_record', { serverUuid });
      return false;
    }

    // Lock cleared - refresh completed
    if (!tokenRecord.refresh_token_locked_at) {
      const waitTime = Date.now() - startTime;
      log.oauth('token_refresh_wait_lock_cleared', {
        serverUuid,
        waitTimeMs: waitTime
      });

      // Verify token is now valid
      const now = Date.now();
      const expiresAt = tokenRecord.expires_at?.getTime() || 0;
      const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

      if (expiresAt > now + bufferTime) {
        log.oauth('token_refresh_wait_success', {
          serverUuid,
          waitTimeMs: waitTime,
          newExpiresAt: tokenRecord.expires_at
        });
        return true;
      } else {
        log.oauth('token_refresh_wait_still_expired', {
          serverUuid,
          waitTimeMs: waitTime,
          expiresAt: tokenRecord.expires_at
        });
        return false;
      }
    }

    // Lock still active - check if it's stale
    const currentLockAge = Date.now() - tokenRecord.refresh_token_locked_at.getTime();
    const maxLockAge = 60 * 1000; // 60 seconds

    if (currentLockAge > maxLockAge) {
      log.oauth('token_refresh_wait_stale_lock', {
        serverUuid,
        lockAgeMs: currentLockAge
      });
      return false;
    }

    // Exponential backoff (double interval, up to max)
    pollInterval = Math.min(pollInterval * 2, maxPollInterval);
  }

  // Timeout
  const totalWaitTime = Date.now() - startTime;
  log.oauth('token_refresh_wait_timeout_exceeded', {
    serverUuid,
    totalWaitTimeMs: totalWaitTime,
    maxWaitTime
  });
  return false;
}

/**
 * P0 Security: Validates that the server belongs to the specified user
 * Prevents token substitution attacks where stolen tokens are used on attacker's servers
 *
 * Performance: Uses a single JOIN query instead of 3 sequential queries (N+1 optimization)
 * Reduces 3 round-trips to 1, improving latency by ~60-70%
 */
async function validateServerOwnership(serverUuid: string, userId: string): Promise<boolean> {
  // Single JOIN query: Server → Profile → Project → User
  const result = await db
    .select({
      user_id: projectsTable.user_id,
      server_uuid: mcpServersTable.uuid
    })
    .from(mcpServersTable)
    .innerJoin(profilesTable, eq(mcpServersTable.profile_uuid, profilesTable.uuid))
    .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
    .where(eq(mcpServersTable.uuid, serverUuid))
    .limit(1);

  if (!result.length) {
    log.security('oauth_server_not_found', userId, { serverUuid });
    return false;
  }

  if (result[0].user_id !== userId) {
    log.security('oauth_ownership_violation', userId, {
      serverUuid,
      expectedUserId: userId,
      actualUserId: result[0].user_id
    });
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
  const startTime = Date.now();
  oauthAudit('TOKEN REFRESH INITIATED', { serverUuid, userId });
  log.oauth('token_refresh_initiated', { serverUuid, userId });

  // P0 Security: Validate server belongs to user (prevents token substitution)
  const isOwner = await validateServerOwnership(serverUuid, userId);
  if (!isOwner) {
    log.oauth('token_refresh_ownership_failed', { serverUuid, userId });
    const durationSeconds = (Date.now() - startTime) / 1000;
    recordTokenRefresh(false, durationSeconds, 'ownership_failed');
    return false;
  }

  // 1. Atomic lock acquisition: Lock the token for refresh (prevents race conditions)
  // This uses pessimistic locking - only acquire lock if not already locked or lock is stale (>60s)
  const staleLockThreshold = new Date(Date.now() - 60 * 1000); // 60 seconds ago
  const lockResult = await db
    .update(mcpServerOAuthTokensTable)
    .set({
      refresh_token_locked_at: new Date(),
    })
    .where(
      and(
        eq(mcpServerOAuthTokensTable.server_uuid, serverUuid),
        // Only acquire lock if not already locked, or lock is stale
        or(
          isNull(mcpServerOAuthTokensTable.refresh_token_locked_at),
          lt(mcpServerOAuthTokensTable.refresh_token_locked_at, staleLockThreshold)
        )
      )
    )
    .returning();

  if (!lockResult || lockResult.length === 0) {
    // Lock is held by another request - wait for it to complete
    oauthAudit('LOCK HELD BY CONCURRENT REQUEST', { serverUuid, userId });
    log.oauth('token_refresh_lock_held_by_another_request', { serverUuid });
    const refreshCompleted = await waitForRefreshCompletion(serverUuid, 0);
    const durationSeconds = (Date.now() - startTime) / 1000;

    if (refreshCompleted) {
      log.oauth('token_refresh_completed_by_concurrent_request', { serverUuid });
      recordTokenRefresh(true, durationSeconds, 'concurrent_success');
      return true;
    } else {
      log.oauth('token_refresh_concurrent_wait_failed', { serverUuid });
      recordTokenRefresh(false, durationSeconds, 'concurrent_failed');
      return false;
    }
  }

  const tokenRecord = lockResult[0];

  oauthAudit('LOCK ACQUIRED', {
    serverUuid,
    userId,
    tokenExpiresAt: tokenRecord.expires_at?.toISOString(),
    hasRefreshToken: !!tokenRecord.refresh_token_encrypted,
    refreshTokenUsedAt: tokenRecord.refresh_token_used_at?.toISOString(),
  });

  if (!tokenRecord.refresh_token_encrypted) {
    log.oauth('token_refresh_no_refresh_token', { serverUuid });
    // Clear the lock since we're not proceeding
    await db.update(mcpServerOAuthTokensTable)
      .set({ refresh_token_locked_at: null })
      .where(eq(mcpServerOAuthTokensTable.server_uuid, serverUuid));
    const durationSeconds = (Date.now() - startTime) / 1000;
    recordTokenRefresh(false, durationSeconds, 'no_refresh_token');
    return false;
  }

  // OAuth 2.1: Check for refresh token reuse (security measure)
  // If token was already used, this indicates a replay attack or race condition
  if (tokenRecord.refresh_token_used_at) {
    log.security('oauth_refresh_token_reuse_detected', userId, {
      serverUuid,
      tokenUsedAt: tokenRecord.refresh_token_used_at,
      currentAttempt: new Date(),
    });

    // Record security event
    recordTokenReuseDetected();

    // CRITICAL: Log token deletion BEFORE deleting for audit trail
    oauthAudit('DELETING TOKEN - Reuse Detected', {
      serverUuid,
      userId,
      reason: 'refresh_token_reuse',
      tokenUsedAt: tokenRecord.refresh_token_used_at?.toISOString(),
      tokenExpiresAt: tokenRecord.expires_at?.toISOString(),
      currentAttempt: new Date().toISOString(),
      stack: new Error().stack,
    }, 'error');

    // Revoke all tokens as a security measure (OAuth 2.1 best practice)
    await db.delete(mcpServerOAuthTokensTable)
      .where(eq(mcpServerOAuthTokensTable.server_uuid, serverUuid));

    oauthAudit('TOKEN DELETED - Reuse Detected', { serverUuid, userId }, 'error');

    // Audit log for security monitoring
    log.security('oauth_tokens_revoked', userId, { serverUuid, reason: 'refresh_token_reuse' });
    recordTokenRevocation('reuse_detected');

    const durationSeconds = (Date.now() - startTime) / 1000;
    recordTokenRefresh(false, durationSeconds, 'reuse_detected');
    return false;
  }

  // 2. Check if token actually needs refresh
  const now = Date.now();
  const expiresAt = tokenRecord.expires_at?.getTime() || 0;
  const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

  if (expiresAt > now + bufferTime) {
    log.oauth('token_refresh_not_needed', { serverUuid });
    // Clear the lock
    await db.update(mcpServerOAuthTokensTable)
      .set({ refresh_token_locked_at: null })
      .where(eq(mcpServerOAuthTokensTable.server_uuid, serverUuid));
    return true; // Token still valid
  }

  // 3. Get OAuth configuration
  const oauthConfig = await getOAuthConfig(serverUuid);
  if (!oauthConfig?.token_endpoint) {
    log.error('OAuth Refresh: No OAuth config or token endpoint', undefined, { serverUuid });
    // Clear the lock
    await db.update(mcpServerOAuthTokensTable)
      .set({ refresh_token_locked_at: null })
      .where(eq(mcpServerOAuthTokensTable.server_uuid, serverUuid));
    return false;
  }

  // 4. Decrypt and use refresh token
  const refreshToken = decryptField(tokenRecord.refresh_token_encrypted);

  log.oauth('token_refresh_exchange_starting', {
    serverUuid,
    tokenEndpoint: oauthConfig.token_endpoint
  });

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
      log.oauth('token_refresh_using_basic_auth', { serverUuid });
    }

    const tokenResponse = await fetch(oauthConfig.token_endpoint, {
      method: 'POST',
      headers,
      body: tokenParams,
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      log.error('OAuth Refresh: Token endpoint error', new Error(errorText), {
        serverUuid,
        statusCode: tokenResponse.status,
      });

      // Error recovery: Clear the lock so the user can retry
      await db.update(mcpServerOAuthTokensTable)
        .set({ refresh_token_locked_at: null })
        .where(eq(mcpServerOAuthTokensTable.server_uuid, serverUuid));

      log.oauth('token_refresh_lock_cleared', { serverUuid, reason: 'endpoint_error' });
      return false;
    }

    const newTokens = await tokenResponse.json();
    log.oauth('token_refresh_exchange_success', { serverUuid });

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

    // OAuth 2.1: Store new tokens, mark old refresh token as used, clear lock
    oauthAudit('UPDATING TOKEN IN DATABASE', {
      serverUuid,
      userId,
      newExpiresAt: newExpiresAt?.toISOString(),
      hasNewRefreshToken: !!newTokens.refresh_token,
      expiresInSeconds: newTokens.expires_in,
    });

    await db.update(mcpServerOAuthTokensTable)
      .set({
        access_token_encrypted: newAccessTokenEncrypted,
        refresh_token_encrypted: newRefreshTokenEncrypted,
        expires_at: newExpiresAt,
        refresh_token_used_at: newTokens.refresh_token ? new Date() : null, // Mark old token as used if we got a new one
        refresh_token_locked_at: null, // Clear the lock
        updated_at: new Date(),
      })
      .where(eq(mcpServerOAuthTokensTable.server_uuid, serverUuid));

    oauthAudit('TOKEN UPDATED SUCCESSFULLY', {
      serverUuid,
      userId,
      newExpiresAt: newExpiresAt?.toISOString(),
      lockCleared: true,
    });

    log.oauth('token_rotation_complete', {
      serverUuid,
      hasNewRefreshToken: !!newTokens.refresh_token
    });

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

      log.oauth('token_updated_streamable_options', { serverUuid });
    }

    oauthAudit('TOKEN REFRESH COMPLETE', {
      serverUuid,
      userId,
      durationMs: Date.now() - startTime,
      success: true,
    });

    log.oauth('token_refresh_success', { serverUuid });
    const durationSeconds = (Date.now() - startTime) / 1000;
    recordTokenRefresh(true, durationSeconds);
    return true;

  } catch (error) {
    oauthAudit('TOKEN REFRESH FAILED', {
      serverUuid,
      userId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      durationMs: Date.now() - startTime,
    }, 'error');

    log.error('OAuth Refresh: Exception during token refresh', error, { serverUuid });

    // Error recovery: Clear the lock so the user can retry
    try {
      await db.update(mcpServerOAuthTokensTable)
        .set({ refresh_token_locked_at: null })
        .where(eq(mcpServerOAuthTokensTable.server_uuid, serverUuid));

      oauthAudit('LOCK CLEARED AFTER ERROR', { serverUuid, userId });
      log.oauth('token_refresh_lock_cleared', { serverUuid, reason: 'exception' });
    } catch (unlockError) {
      oauthAudit('FAILED TO CLEAR LOCK', {
        serverUuid,
        userId,
        error: unlockError instanceof Error ? unlockError.message : String(unlockError),
      }, 'error');
      log.error('OAuth Refresh: Failed to clear lock', unlockError, { serverUuid });
    }

    const durationSeconds = (Date.now() - startTime) / 1000;
    recordTokenRefresh(false, durationSeconds, 'exception');
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
    log.security('oauth_validate_ownership_failed', userId, { serverUuid });
    return false;
  }

  // Check if token is expired
  const expired = await isTokenExpired(serverUuid);

  if (!expired) {
    return true; // Token is still valid
  }

  // Try to refresh the token
  log.oauth('token_expired_attempting_refresh', { serverUuid });
  return await refreshOAuthToken(serverUuid, userId);
}