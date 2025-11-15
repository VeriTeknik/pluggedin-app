/**
 * OAuth Token Refresh Scheduler
 *
 * Proactively refreshes OAuth tokens before they expire to prevent service disruptions.
 * Runs as a background service in the Next.js application.
 *
 * Features:
 * - Refreshes tokens 15 minutes before expiry
 * - Batched processing with configurable limits
 * - Proper locking to prevent concurrent refreshes
 * - Comprehensive metrics and logging for observability
 * - Error handling and recovery
 *
 * Compatible with pluggedin-observability Prometheus/Loki stack
 */

import { and, eq, isNull, lt, or } from 'drizzle-orm';
import pLimit from 'p-limit';

import { db } from '@/db';
import { mcpServersTable, mcpServerOAuthTokensTable, profilesTable, projectsTable } from '@/db/schema';
import { log } from '@/lib/observability/logger';
import {
  recordScheduledRefresh,
  recordScheduledRefreshError,
  updateTokensExpiringSoonGauge,
} from '@/lib/observability/oauth-metrics';
import { refreshOAuthToken } from '@/lib/oauth/token-refresh-service';

// Configuration
const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const EXPIRY_BUFFER_MS = 15 * 60 * 1000; // 15 minutes before expiry
const BATCH_SIZE = 50; // Process up to 50 tokens per run
const STALE_LOCK_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
const REFRESH_CONCURRENCY_LIMIT = 5; // Max concurrent OAuth refreshes to avoid overwhelming providers

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Standardized OAuth scheduler logging helper
 * Logs to both console (for journalctl/stdout) and structured logger
 */
function schedulerAudit(
  event: string,
  details: Record<string, any>,
  level: 'info' | 'error' = 'info'
) {
  const payload = { timestamp: new Date().toISOString(), ...details };
  if (level === 'error') {
    console.error(`[OAuth Scheduler] ${event}:`, payload);
  } else {
    console.log(`[OAuth Scheduler] ${event}:`, payload);
  }
}

/**
 * Token information for refresh processing
 */
interface TokenInfo {
  server_uuid: string;
  expires_at: Date | null;
  user_id: string;
  server_name: string | null;
  locked_at: Date | null;
}

/**
 * Result of processing a single token
 */
interface TokenProcessResult {
  status: 'fulfilled' | 'rejected';
  value?: { success: boolean; error?: string; token: TokenInfo };
  reason?: string;
}

/**
 * Get all OAuth tokens expiring soon
 * Returns tokens with server ownership information for refresh
 */
async function getExpiringTokens() {
  const expiryThreshold = new Date(Date.now() + EXPIRY_BUFFER_MS);

  schedulerAudit('QUERYING EXPIRING TOKENS', {
    expiryThreshold: expiryThreshold.toISOString(),
    bufferMinutes: EXPIRY_BUFFER_MS / 60000,
  });

  // Query tokens expiring soon that are not currently locked
  const expiringTokens = await db
    .select({
      server_uuid: mcpServerOAuthTokensTable.server_uuid,
      expires_at: mcpServerOAuthTokensTable.expires_at,
      user_id: projectsTable.user_id,
      server_name: mcpServersTable.name,
      locked_at: mcpServerOAuthTokensTable.refresh_token_locked_at,
    })
    .from(mcpServerOAuthTokensTable)
    .innerJoin(mcpServersTable, eq(mcpServersTable.uuid, mcpServerOAuthTokensTable.server_uuid))
    .innerJoin(profilesTable, eq(profilesTable.uuid, mcpServersTable.profile_uuid))
    .innerJoin(projectsTable, eq(projectsTable.uuid, profilesTable.project_uuid))
    .where(
      and(
        // Token expires soon
        lt(mcpServerOAuthTokensTable.expires_at, expiryThreshold),
        // Token is not locked or lock is stale
        or(
          isNull(mcpServerOAuthTokensTable.refresh_token_locked_at),
          lt(
            mcpServerOAuthTokensTable.refresh_token_locked_at,
            new Date(Date.now() - STALE_LOCK_THRESHOLD_MS)
          )
        )
      )
    )
    .limit(BATCH_SIZE);

  schedulerAudit('FOUND EXPIRING TOKENS', {
    count: expiringTokens.length,
    tokens: expiringTokens.map(t => ({
      serverUuid: t.server_uuid,
      serverName: t.server_name,
      expiresAt: t.expires_at?.toISOString() || 'never',
      minutesUntilExpiry: t.expires_at ? (t.expires_at.getTime() - Date.now()) / 60000 : null,
      isLocked: !!t.locked_at,
    })),
  });

  return expiringTokens;
}

/**
 * Process a single token refresh
 * Returns standardized result for aggregation
 */
async function processToken(token: TokenInfo): Promise<TokenProcessResult> {
  schedulerAudit('REFRESHING TOKEN', {
    serverUuid: token.server_uuid,
    serverName: token.server_name,
    expiresAt: token.expires_at?.toISOString() || 'never',
    userId: token.user_id,
  });

  try {
    const success = await refreshOAuthToken(token.server_uuid, token.user_id);

    if (success) {
      schedulerAudit('TOKEN REFRESH SUCCESS', {
        serverUuid: token.server_uuid,
        serverName: token.server_name,
      });

      log.oauth('scheduled_token_refreshed', {
        serverUuid: token.server_uuid,
        serverName: token.server_name,
        expiresAt: token.expires_at,
      });

      return { status: 'fulfilled', value: { success: true, token } };
    } else {
      const errorMsg = `Failed to refresh token for ${token.server_name || token.server_uuid}`;

      schedulerAudit('TOKEN REFRESH FAILED', {
        serverUuid: token.server_uuid,
        serverName: token.server_name,
        expiresAt: token.expires_at?.toISOString() || 'never',
        reason: 'endpoint_error',
      }, 'error');

      log.oauth('scheduled_token_refresh_failed', {
        serverUuid: token.server_uuid,
        serverName: token.server_name,
        expiresAt: token.expires_at,
      });

      recordScheduledRefreshError('endpoint_error');
      return { status: 'fulfilled', value: { success: false, error: errorMsg, token } };
    }
  } catch (error) {
    const errorMsg = `Error refreshing token for ${token.server_name || token.server_uuid}: ${
      error instanceof Error ? error.message : 'Unknown error'
    }`;

    schedulerAudit('TOKEN REFRESH EXCEPTION', {
      serverUuid: token.server_uuid,
      serverName: token.server_name,
      expiresAt: token.expires_at?.toISOString() || 'never',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, 'error');

    log.error('OAuth Scheduled Refresh: Exception during token refresh', error, {
      serverUuid: token.server_uuid,
      serverName: token.server_name,
    });

    recordScheduledRefreshError('exception');
    return { status: 'rejected', reason: errorMsg };
  }
}

/**
 * Summarize results from parallel token processing
 * Aggregates successes, failures, and errors
 */
function summarizeResults(settled: PromiseSettledResult<TokenProcessResult>[]) {
  const results = {
    refreshed: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value.status === 'fulfilled') {
      const { success, error } = result.value.value!;
      if (success) {
        results.refreshed++;
      } else {
        results.failed++;
        if (error) results.errors.push(error);
      }
    } else if (result.status === 'rejected') {
      results.failed++;
      results.errors.push(result.reason);
    }
  }

  return results;
}

/**
 * Refresh a batch of expiring tokens
 * Returns summary of refresh results
 */
async function refreshExpiringTokens() {
  const startTime = Date.now();

  try {
    // Get tokens expiring soon
    const tokens = await getExpiringTokens();

    log.oauth('scheduled_refresh_started', {
      tokensFound: tokens.length,
      expiryBufferMinutes: EXPIRY_BUFFER_MS / 60000,
    });

    // Update gauge
    updateTokensExpiringSoonGauge(tokens.length);

    if (tokens.length === 0) {
      const durationSeconds = (Date.now() - startTime) / 1000;
      recordScheduledRefresh(true, durationSeconds, 0, 0, 0);
      return { refreshed: 0, failed: 0, errors: [] };
    }

    // Refresh tokens with concurrency limit to avoid overwhelming OAuth providers
    // Using p-limit to control simultaneous refreshes and prevent rate limiting
    const limit = pLimit(REFRESH_CONCURRENCY_LIMIT);
    const refreshPromises = tokens.map(token => limit(() => processToken(token)));

    // Wait for all refresh operations to complete
    const settled = await Promise.allSettled(refreshPromises);

    // Collect and summarize results
    const results = summarizeResults(settled);

    // Record overall metrics
    const durationSeconds = (Date.now() - startTime) / 1000;
    const success = results.failed === 0;

    recordScheduledRefresh(
      success,
      durationSeconds,
      tokens.length,
      results.refreshed,
      results.failed
    );

    log.oauth('scheduled_refresh_completed', {
      tokensChecked: tokens.length,
      tokensRefreshed: results.refreshed,
      tokensFailed: results.failed,
      durationSeconds,
      success,
    });

    return results;
  } catch (error) {
    const durationSeconds = (Date.now() - startTime) / 1000;

    log.error('OAuth Scheduled Refresh: Fatal error during scheduled refresh', error, {
      durationSeconds,
    });

    recordScheduledRefresh(false, durationSeconds, 0, 0, 1);
    recordScheduledRefreshError('exception');

    return {
      refreshed: 0,
      failed: 1,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

/**
 * Check if running in a test environment
 */
function isTestEnvironment(): boolean {
  const env = process.env;
  return !!(
    env.NODE_ENV?.toLowerCase().includes('test') ||
    env.VITEST ||
    env.JEST_WORKER_ID ||
    env.MOCHA ||
    env.JASMINE ||
    env.TEST_ENV
  );
}

/**
 * Start the token refresh scheduler
 * Runs periodically to refresh expiring tokens
 *
 * @param intervalMs - Refresh check interval in milliseconds (default: 10 minutes)
 * @param bufferMs - Expiry buffer time in milliseconds (default: 15 minutes)
 */
export function startTokenRefreshScheduler(
  intervalMs: number = REFRESH_INTERVAL_MS,
  bufferMs: number = EXPIRY_BUFFER_MS
) {
  // Don't start in test environment
  if (isTestEnvironment()) {
    schedulerAudit('SKIPPING SCHEDULER STARTUP', { reason: 'test_environment' });
    return;
  }

  // Don't start if already running
  if (schedulerInterval) {
    schedulerAudit('SCHEDULER ALREADY RUNNING', {});
    return;
  }

  schedulerAudit('STARTING TOKEN REFRESH SCHEDULER', {
    intervalMinutes: intervalMs / 60000,
    bufferMinutes: bufferMs / 60000,
  });

  // Run immediately on startup
  refreshExpiringTokens()
    .then((results) => {
      schedulerAudit('INITIAL REFRESH COMPLETED', {
        refreshed: results.refreshed,
        failed: results.failed,
      });
    })
    .catch((error) => {
      schedulerAudit('INITIAL REFRESH FAILED', { error: String(error) }, 'error');
    });

  // Schedule periodic runs
  schedulerInterval = setInterval(() => {
    refreshExpiringTokens()
      .then((results) => {
        if (results.refreshed > 0 || results.failed > 0) {
          schedulerAudit('REFRESH COMPLETED', {
            refreshed: results.refreshed,
            failed: results.failed,
          });
        }
      })
      .catch((error) => {
        schedulerAudit('SCHEDULED REFRESH FAILED', { error: String(error) }, 'error');
      });
  }, intervalMs);

  // Prevent the interval from keeping the process alive
  if (schedulerInterval.unref) {
    schedulerInterval.unref();
  }

  log.oauth('token_refresh_scheduler_started', {
    intervalMs,
    bufferMs,
    batchSize: BATCH_SIZE,
  });
}

/**
 * Stop the token refresh scheduler
 * Used for graceful shutdown or testing
 */
export function stopTokenRefreshScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    schedulerAudit('TOKEN REFRESH SCHEDULER STOPPED', {});
    log.oauth('token_refresh_scheduler_stopped', {});
  }
}

/**
 * Manual trigger for token refresh
 * Used by API endpoint for cron jobs
 *
 * @returns Summary of refresh results
 */
export async function triggerTokenRefresh() {
  return await refreshExpiringTokens();
}
