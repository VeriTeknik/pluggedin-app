import { lt, eq } from 'drizzle-orm';

import { db } from '@/db';
import { oauthPkceStatesTable } from '@/db/schema';

/**
 * P0 Security: Clean up expired PKCE states
 * Prevents database bloat and ensures expired states can't be reused
 *
 * OAuth 2.1: States expire after 5 minutes (reduced from 10 for security)
 *
 * Should be called:
 * - On application startup (automatic)
 * - Periodically via in-process timer (automatic, every 10 minutes)
 * - Periodically via external cron (optional, POST /api/oauth/cleanup-pkce)
 */
export async function cleanupExpiredPkceStates(): Promise<number> {
  try {
    const now = new Date();

    const result = await db
      .delete(oauthPkceStatesTable)
      .where(lt(oauthPkceStatesTable.expires_at, now));

    const deletedCount = result.rowCount ?? 0;

    if (deletedCount > 0) {
      console.log(`[OAuth Cleanup] Deleted ${deletedCount} expired PKCE states`);
    }

    return deletedCount;
  } catch (error) {
    console.error('[OAuth Cleanup] Failed to clean up expired PKCE states:', error);
    return 0;
  }
}

/**
 * Clean up PKCE states for a specific server
 * Called when a server is deleted or OAuth flow is reset
 */
export async function cleanupServerPkceStates(serverUuid: string): Promise<void> {
  try {
    await db
      .delete(oauthPkceStatesTable)
      .where(eq(oauthPkceStatesTable.server_uuid, serverUuid));

    console.log(`[OAuth Cleanup] Deleted PKCE states for server: ${serverUuid}`);
  } catch (error) {
    console.error('[OAuth Cleanup] Failed to clean up server PKCE states:', error);
  }
}

/**
 * Automatic in-process cleanup scheduler
 * Runs every 10 minutes to clean up expired PKCE states
 */
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
  // Run cleanup every 10 minutes (600,000ms)
  setInterval(() => {
    cleanupExpiredPkceStates().catch((err) =>
      console.error('[OAuth Cleanup] Scheduled cleanup failed:', err)
    );
  }, 10 * 60 * 1000);

  // Also run cleanup on application startup
  cleanupExpiredPkceStates().catch((err) =>
    console.error('[OAuth Cleanup] Startup cleanup failed:', err)
  );

  console.log('[OAuth Cleanup] Automatic PKCE state cleanup initialized (every 10 minutes)');
}
