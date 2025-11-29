/**
 * Shared clipboard query builders
 * Centralized condition building for consistent behavior between routes and actions
 */

import { and, eq, isNotNull, lt } from 'drizzle-orm';

import { db } from '@/db';
import { clipboardsTable } from '@/db/schema';

export type ClipboardFilter = {
  profileUuid: string;
  name?: string;
  idx?: number;
  contentType?: string;
};

/**
 * Build WHERE conditions for clipboard queries
 * Keeps filtering logic consistent between read/delete paths
 */
export function buildClipboardConditions({
  profileUuid,
  name,
  idx,
  contentType,
}: ClipboardFilter) {
  const conditions = [eq(clipboardsTable.profile_uuid, profileUuid)];

  if (name !== undefined) {
    conditions.push(eq(clipboardsTable.name, name));
  }
  if (idx !== undefined) {
    conditions.push(eq(clipboardsTable.idx, idx));
  }
  if (contentType !== undefined) {
    conditions.push(eq(clipboardsTable.content_type, contentType));
  }

  return and(...conditions);
}

/**
 * Clean up expired clipboard entries for a profile
 * Non-blocking, logs errors but doesn't throw
 *
 * Note: Entries with NULL expires_at are preserved (they never expire)
 */
export function cleanupExpiredClipboards(profileUuid: string): Promise<void> {
  return db
    .delete(clipboardsTable)
    .where(
      and(
        eq(clipboardsTable.profile_uuid, profileUuid),
        isNotNull(clipboardsTable.expires_at),
        lt(clipboardsTable.expires_at, new Date())
      )
    )
    .execute()
    .then(() => {})
    .catch(console.error);
}

/**
 * Clean up all expired clipboard entries globally
 * Used by the cron cleanup job
 *
 * Note: Entries with NULL expires_at are preserved (they never expire)
 * The isNotNull check makes the SQL explicit rather than relying on
 * NULL comparison semantics (NULL < date returns NULL/unknown, not false)
 */
export async function cleanupAllExpiredClipboards(): Promise<number> {
  const result = await db
    .delete(clipboardsTable)
    .where(
      and(
        isNotNull(clipboardsTable.expires_at),
        lt(clipboardsTable.expires_at, new Date())
      )
    )
    .returning({ uuid: clipboardsTable.uuid });

  return result.length;
}
