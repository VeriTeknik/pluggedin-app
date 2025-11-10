import { lt, eq } from 'drizzle-orm';

import { db } from '@/db';
import { oauthPkceStatesTable } from '@/db/schema';
import { log } from '@/lib/observability/logger';
import { recordPkceCleanup } from '@/lib/observability/oauth-metrics';

/**
 * P0 Security: Clean up expired PKCE states
 * Prevents database bloat and ensures expired states can't be reused
 *
 * OAuth 2.1: States expire after 5 minutes (reduced from 10 for security)
 * Grace period: Only delete states expired >10min ago to avoid interfering with legitimate flows
 *
 * Should be called:
 * - On application startup (automatic, after delay)
 * - Periodically via in-process timer (automatic, every 15 minutes)
 * - Periodically via external cron (optional, POST /api/oauth/cleanup-pkce)
 *
 * @param gracePeriodMs - Grace period in milliseconds (default: 10 minutes)
 */
export async function cleanupExpiredPkceStates(gracePeriodMs: number = 10 * 60 * 1000): Promise<number> {
  try {
    // Only delete states that expired more than gracePeriodMs ago
    // This prevents interfering with legitimate OAuth flows that may take time
    const cutoffTime = new Date(Date.now() - gracePeriodMs);

    const result = await db
      .delete(oauthPkceStatesTable)
      .where(lt(oauthPkceStatesTable.expires_at, cutoffTime));

    const deletedCount = result.rowCount ?? 0;

    if (deletedCount > 0) {
      log.oauth('pkce_cleanup_completed', {
        deletedCount,
        cutoffTime: cutoffTime.toISOString()
      });
      recordPkceCleanup(deletedCount, 'expired');
    }

    return deletedCount;
  } catch (error) {
    log.error('OAuth Cleanup: Failed to clean up expired PKCE states', error);
    return 0;
  }
}

/**
 * Clean up PKCE states for a specific server
 * Called when a server is deleted or OAuth flow is reset
 */
export async function cleanupServerPkceStates(serverUuid: string): Promise<void> {
  try {
    const result = await db
      .delete(oauthPkceStatesTable)
      .where(eq(oauthPkceStatesTable.server_uuid, serverUuid));

    const deletedCount = result.rowCount ?? 0;
    log.oauth('pkce_server_cleanup_completed', { serverUuid, deletedCount });

    if (deletedCount > 0) {
      recordPkceCleanup(deletedCount, 'server_deleted');
    }
  } catch (error) {
    log.error('OAuth Cleanup: Failed to clean up server PKCE states', error, { serverUuid });
  }
}

/**
 * Automatic in-process cleanup scheduler
 * Runs every 15 minutes to clean up expired PKCE states
 * Increased from 10 minutes to reduce interference with legitimate flows
 */
if (typeof process !== 'undefined' &&
    process.env.NODE_ENV !== 'test' &&
    typeof process.env.VITEST === 'undefined') {

  const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
  const STARTUP_DELAY_MS = 2 * 60 * 1000; // 2 minutes delay after startup

  // Run cleanup every 15 minutes
  setInterval(() => {
    cleanupExpiredPkceStates().catch((err) =>
      log.error('OAuth Cleanup: Scheduled cleanup failed', err)
    );
  }, CLEANUP_INTERVAL_MS);

  // Defer startup cleanup to avoid interfering with OAuth callbacks
  // that may arrive immediately after application restart
  setTimeout(() => {
    cleanupExpiredPkceStates().catch((err) =>
      log.error('OAuth Cleanup: Startup cleanup failed', err)
    );
  }, STARTUP_DELAY_MS);

  log.oauth('pkce_cleanup_scheduler_initialized', {
    intervalMinutes: 15,
    gracePeriodMinutes: 10,
    startupDelayMinutes: 2
  });
}
