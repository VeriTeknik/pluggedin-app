import { lt } from 'drizzle-orm';

import { db } from '@/db';
import { mcpServerOAuthTokensTable } from '@/db/schema';
import { log } from '@/lib/observability/logger';

/**
 * Background cleanup service for orphaned OAuth token refresh locks
 *
 * Runs periodically to clear stale locks that were not properly released
 * due to crashes, timeouts, or network failures during token refresh.
 *
 * This prevents indefinite lock situations where users cannot refresh tokens
 * because a previous attempt failed to clear the lock.
 */

let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Clears OAuth token refresh locks that are older than the threshold
 * @param thresholdMs - Age in milliseconds after which a lock is considered stale
 * @returns Number of locks cleared
 */
export async function clearStaleLocks(thresholdMs: number = 60 * 1000): Promise<number> {
  try {
    const staleLockThreshold = new Date(Date.now() - thresholdMs);

    const result = await db
      .update(mcpServerOAuthTokensTable)
      .set({ refresh_token_locked_at: null })
      .where(lt(mcpServerOAuthTokensTable.refresh_token_locked_at, staleLockThreshold))
      .returning({ server_uuid: mcpServerOAuthTokensTable.server_uuid });

    const clearedCount = result.length;

    if (clearedCount > 0) {
      log.oauth('token_lock_cleanup_cleared_stale_locks', {
        clearedCount,
        thresholdMs,
        serverUuids: result.map(r => r.server_uuid)
      });
    }

    return clearedCount;
  } catch (error) {
    log.error('OAuth Token Lock Cleanup: Failed to clear stale locks', error, { thresholdMs });
    return 0;
  }
}

/**
 * Starts the background cleanup job
 * @param intervalMs - How often to run cleanup (default: 60 seconds)
 * @param thresholdMs - Age threshold for stale locks (default: 60 seconds)
 */
export function startTokenLockCleanup(
  intervalMs: number = 60 * 1000,
  thresholdMs: number = 60 * 1000
): void {
  // Prevent multiple cleanup jobs
  if (cleanupInterval) {
    log.warn('OAuth Token Lock Cleanup: Already running, skipping start');
    return;
  }

  log.info('OAuth Token Lock Cleanup: Starting background cleanup', {
    intervalMs,
    thresholdMs
  });

  // Run cleanup immediately on start
  clearStaleLocks(thresholdMs).catch(error => {
    log.error('OAuth Token Lock Cleanup: Initial cleanup failed', error);
  });

  // Schedule periodic cleanup
  cleanupInterval = setInterval(() => {
    clearStaleLocks(thresholdMs).catch(error => {
      log.error('OAuth Token Lock Cleanup: Periodic cleanup failed', error);
    });
  }, intervalMs);

  // Ensure cleanup stops on process exit
  process.on('beforeExit', () => {
    stopTokenLockCleanup();
  });
}

/**
 * Stops the background cleanup job
 */
export function stopTokenLockCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    log.info('OAuth Token Lock Cleanup: Stopped');
  }
}

/**
 * Returns whether the cleanup job is currently running
 */
export function isCleanupRunning(): boolean {
  return cleanupInterval !== null;
}
