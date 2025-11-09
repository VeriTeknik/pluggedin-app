import { lt, eq } from 'drizzle-orm';

import { db } from '@/db';
import { oauthPkceStatesTable } from '@/db/schema';

/**
 * P0 Security: Clean up expired PKCE states
 * Prevents database bloat and ensures expired states can't be reused
 *
 * Should be called:
 * - On application startup
 * - Periodically via cron/scheduler (every 5-10 minutes)
 * - Before creating new PKCE states (optional)
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
