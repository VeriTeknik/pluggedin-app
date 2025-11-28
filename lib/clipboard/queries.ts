/**
 * Shared clipboard query builders
 * Centralized condition building for consistent behavior between routes and actions
 */

import { and, eq, lt } from 'drizzle-orm';

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
 */
export function cleanupExpiredClipboards(profileUuid: string): Promise<void> {
  return db
    .delete(clipboardsTable)
    .where(
      and(
        eq(clipboardsTable.profile_uuid, profileUuid),
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
 */
export async function cleanupAllExpiredClipboards(): Promise<number> {
  const result = await db
    .delete(clipboardsTable)
    .where(lt(clipboardsTable.expires_at, new Date()))
    .returning({ uuid: clipboardsTable.uuid });

  return result.length;
}
