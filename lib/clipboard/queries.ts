/**
 * Shared clipboard query builders
 * Centralized condition building for consistent behavior between routes and actions
 */

import { and, eq, isNotNull, lt } from 'drizzle-orm';

import { db } from '@/db';
import { clipboardsTable } from '@/db/schema';

/**
 * Visibility scopes for clipboard entries
 * - private: Only the owner profile can see (default, always enforced)
 * - workspace: All profiles in the same project can see (TODO: requires project context)
 * - public: Anyone can see (TODO: requires cross-profile query support)
 *
 * SECURITY NOTE: Until workspace/public queries are implemented,
 * we defensively filter to only show entries that match the current profile
 * AND have appropriate visibility for the query context.
 */
export type ClipboardVisibility = 'private' | 'workspace' | 'public';

export type ClipboardFilter = {
  profileUuid: string;
  name?: string;
  idx?: number;
  contentType?: string;
  /**
   * Visibility scope for the query.
   * - undefined: Only return 'private' entries (default, most restrictive)
   * - 'private': Only return entries visible to the profile owner
   * - 'all': Return all entries owned by this profile regardless of visibility
   *          (used for listing own entries with their visibility metadata)
   */
  visibilityScope?: 'private' | 'all';
};

/**
 * Build WHERE conditions for clipboard queries
 * Keeps filtering logic consistent between read/delete paths
 *
 * SECURITY: Always enforces visibility constraints:
 * - By default, only returns 'private' entries owned by the profile
 * - 'all' scope returns all entries owned by the profile (for UI display)
 *
 * TODO: Implement workspace/public visibility when cross-profile queries are needed
 * - workspace: Query entries where visibility='workspace' AND profile is in same project
 * - public: Query entries where visibility='public' from any profile
 */
export function buildClipboardConditions({
  profileUuid,
  name,
  idx,
  contentType,
  visibilityScope,
}: ClipboardFilter) {
  // Always require profile ownership for security
  const conditions = [eq(clipboardsTable.profile_uuid, profileUuid)];

  // Visibility enforcement
  // 'all' scope: Return all entries owned by this profile (used for UI listing)
  // undefined or 'private': Only return private entries (default, most restrictive)
  if (visibilityScope !== 'all') {
    conditions.push(eq(clipboardsTable.visibility, 'private'));
  }

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
 * Non-blocking, logs detailed error information for observability
 *
 * Note: Entries with NULL expires_at are preserved (they never expire)
 * @returns Promise resolving to number of deleted entries, or -1 on error
 */
export async function cleanupExpiredClipboards(profileUuid: string): Promise<number> {
  try {
    const result = await db
      .delete(clipboardsTable)
      .where(
        and(
          eq(clipboardsTable.profile_uuid, profileUuid),
          isNotNull(clipboardsTable.expires_at),
          lt(clipboardsTable.expires_at, new Date())
        )
      )
      .returning({ uuid: clipboardsTable.uuid });

    return result.length;
  } catch (error) {
    console.error('Failed to clean up expired clipboards for profile:', {
      profileUuid,
      error: error instanceof Error ? error.message : String(error),
    });
    return -1; // Indicate error without throwing
  }
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
