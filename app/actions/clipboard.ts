'use server';

import { desc, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { clipboardsTable, projectsTable } from '@/db/schema';
import {
  buildClipboardConditions,
  calculateClipboardSize,
  calculateExpirationDate,
  type ClipboardEntry,
  toClipboardEntries,
  toClipboardEntry,
  validateClipboardSize,
  validateContentEncoding,
} from '@/lib/clipboard';

import { getProjectActiveProfile } from './profiles';

// Re-export ClipboardEntry type for consumers
export type { ClipboardEntry };

interface ClipboardResult {
  success: boolean;
  entries?: ClipboardEntry[];
  entry?: ClipboardEntry;
  total?: number;
  deleted?: number;
  error?: string;
}

/**
 * Get profile UUID from userId by finding their active project's active profile
 */
async function getActiveProfileUuid(userId: string): Promise<string | null> {
  // Find the user's project (they can have one project in the simplified model)
  const project = await db
    .select({ uuid: projectsTable.uuid })
    .from(projectsTable)
    .where(eq(projectsTable.user_id, userId))
    .limit(1);

  if (project.length === 0) {
    return null;
  }

  const activeProfile = await getProjectActiveProfile(project[0].uuid);
  return activeProfile?.uuid ?? null;
}

/**
 * Get all clipboard entries for the current user's active profile
 */
export async function getClipboardEntries(
  userId: string,
  options?: {
    name?: string;
    idx?: number;
    contentType?: string;
    limit?: number;
    offset?: number;
  }
): Promise<ClipboardResult> {
  try {
    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    // Build query conditions using shared helper
    // UI actions use 'all' scope to display entries with their visibility metadata
    const where = buildClipboardConditions({
      profileUuid,
      name: options?.name,
      idx: options?.idx,
      contentType: options?.contentType,
      visibilityScope: 'all', // Show all user's own entries in UI
    });

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    // Execute query
    const entries = await db
      .select()
      .from(clipboardsTable)
      .where(where)
      .orderBy(desc(clipboardsTable.created_at))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(clipboardsTable)
      .where(where);

    const total = totalResult[0]?.count ?? 0;

    // Transform entries for response using shared helper
    const transformedEntries = toClipboardEntries(entries);

    // If requesting single entry by name or idx, return just that entry
    if (options?.name !== undefined || options?.idx !== undefined) {
      if (entries.length === 0) {
        return { success: false, error: 'Clipboard entry not found' };
      }
      return { success: true, entry: transformedEntries[0] };
    }

    return { success: true, entries: transformedEntries, total };
  } catch (error) {
    console.error('Error fetching clipboard entries:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}


/**
 * Set a clipboard entry (upsert for named, error if idx exists)
 */
export async function setClipboardEntry(
  userId: string,
  options: {
    name?: string;
    idx?: number;
    value: string;
    contentType?: string;
    encoding?: 'utf-8' | 'base64' | 'hex';
    visibility?: 'private' | 'workspace' | 'public';
    createdByTool?: string;
    createdByModel?: string;
    source?: 'ui' | 'sdk' | 'mcp';
    ttlSeconds?: number;
  }
): Promise<ClipboardResult> {
  try {
    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    if (options.name === undefined && options.idx === undefined) {
      return { success: false, error: 'Either name or idx must be provided' };
    }

    // Validate size using shared helper
    const sizeError = validateClipboardSize(options.value);
    if (sizeError) {
      return { success: false, error: sizeError };
    }

    // Validate content matches declared encoding
    const encoding = options.encoding ?? 'utf-8';
    const encodingError = validateContentEncoding(options.value, encoding);
    if (encodingError) {
      return { success: false, error: encodingError };
    }

    const sizeBytes = calculateClipboardSize(options.value);
    const expiresAt = calculateExpirationDate(options.ttlSeconds);

    const entryData = {
      profile_uuid: profileUuid,
      name: options.name ?? null,
      idx: options.idx ?? null,
      value: options.value,
      content_type: options.contentType ?? 'text/plain',
      encoding: options.encoding ?? 'utf-8',
      size_bytes: sizeBytes,
      visibility: options.visibility ?? 'private',
      created_by_tool: options.createdByTool ?? null,
      created_by_model: options.createdByModel ?? null,
      source: options.source ?? 'ui',
      expires_at: expiresAt,
      updated_at: new Date(),
    };

    let result;

    if (options.name !== undefined) {
      // Named entry: upsert (update if exists, insert if not)
      result = await db
        .insert(clipboardsTable)
        .values(entryData)
        .onConflictDoUpdate({
          target: [clipboardsTable.profile_uuid, clipboardsTable.name],
          set: {
            value: entryData.value,
            content_type: entryData.content_type,
            encoding: entryData.encoding,
            size_bytes: entryData.size_bytes,
            visibility: entryData.visibility,
            created_by_tool: entryData.created_by_tool,
            created_by_model: entryData.created_by_model,
            source: entryData.source,
            expires_at: entryData.expires_at,
            updated_at: new Date(),
          },
        })
        .returning();
    } else {
      // Indexed entry: use atomic insert with conflict handling
      // This prevents race conditions where two concurrent requests could both pass a check-then-insert
      result = await db
        .insert(clipboardsTable)
        .values(entryData)
        .onConflictDoNothing({
          target: [clipboardsTable.profile_uuid, clipboardsTable.idx],
        })
        .returning();

      // If no rows returned, the index already exists
      if (result.length === 0) {
        return {
          success: false,
          error: 'Conflict with existing entry. Use push for auto-increment or delete first.',
        };
      }
    }

    return {
      success: true,
      entry: toClipboardEntry(result[0]),
    };
  } catch (error) {
    console.error('Error setting clipboard entry:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Delete clipboard entries
 */
export async function deleteClipboardEntry(
  userId: string,
  options: { name?: string; idx?: number; clearAll?: boolean }
): Promise<ClipboardResult> {
  try {
    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    if (options.clearAll) {
      const result = await db
        .delete(clipboardsTable)
        .where(eq(clipboardsTable.profile_uuid, profileUuid))
        .returning({ uuid: clipboardsTable.uuid });

      return { success: true, deleted: result.length };
    }

    if (options.name === undefined && options.idx === undefined) {
      return { success: false, error: 'Either name, idx, or clearAll must be provided' };
    }

    // Build conditions using shared helper
    // Delete uses 'all' scope so users can delete any of their own entries
    const where = buildClipboardConditions({
      profileUuid,
      name: options.name,
      idx: options.idx,
      visibilityScope: 'all', // Allow deleting any own entry regardless of visibility
    });

    const result = await db
      .delete(clipboardsTable)
      .where(where)
      .returning({ uuid: clipboardsTable.uuid });

    if (result.length === 0) {
      return { success: false, error: 'Clipboard entry not found' };
    }

    return { success: true, deleted: result.length };
  } catch (error) {
    console.error('Error deleting clipboard entry:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get clipboard stats using SQL aggregation to avoid N+1 queries
 * This is more efficient than fetching all entries and processing in JS
 */
export async function getClipboardStats(userId: string): Promise<{
  success: boolean;
  stats?: {
    total: number;
    totalSize: number;
    expiringToday: number;
    contentTypes: number;
  };
  error?: string;
}> {
  try {
    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    const now = new Date();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    // Use SQL aggregation instead of fetching all entries
    // This is much more efficient for large datasets
    const result = await db
      .select({
        total: sql<number>`count(*)::int`,
        totalSize: sql<number>`coalesce(sum(${clipboardsTable.size_bytes}), 0)::int`,
        expiringToday: sql<number>`count(*) filter (where ${clipboardsTable.expires_at} >= ${now} and ${clipboardsTable.expires_at} <= ${endOfDay})::int`,
        contentTypes: sql<number>`count(distinct ${clipboardsTable.content_type})::int`,
      })
      .from(clipboardsTable)
      .where(eq(clipboardsTable.profile_uuid, profileUuid));

    const stats = result[0];

    return {
      success: true,
      stats: {
        total: stats?.total ?? 0,
        totalSize: stats?.totalSize ?? 0,
        expiringToday: stats?.expiringToday ?? 0,
        contentTypes: stats?.contentTypes ?? 0,
      },
    };
  } catch (error) {
    console.error('Error getting clipboard stats:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
