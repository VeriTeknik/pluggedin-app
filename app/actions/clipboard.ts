'use server';

import { and, desc, eq, lt, sql } from 'drizzle-orm';

import { db } from '@/db';
import { clipboardsTable, projectsTable } from '@/db/schema';

import { getProjectActiveProfile } from './profiles';

export interface ClipboardEntry {
  uuid: string;
  name: string | null;
  idx: number | null;
  value: string;
  contentType: string;
  encoding: string;
  sizeBytes: number;
  visibility: string;
  createdByTool: string | null;
  createdByModel: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

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

    // Clean up expired entries first (async, non-blocking)
    db.delete(clipboardsTable)
      .where(
        and(
          eq(clipboardsTable.profile_uuid, profileUuid),
          lt(clipboardsTable.expires_at, new Date())
        )
      )
      .execute()
      .catch(console.error);

    // Build query conditions
    const conditions = [eq(clipboardsTable.profile_uuid, profileUuid)];

    if (options?.name !== undefined) {
      conditions.push(eq(clipboardsTable.name, options.name));
    }

    if (options?.idx !== undefined) {
      conditions.push(eq(clipboardsTable.idx, options.idx));
    }

    if (options?.contentType) {
      conditions.push(eq(clipboardsTable.content_type, options.contentType));
    }

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    // Execute query
    const entries = await db
      .select()
      .from(clipboardsTable)
      .where(and(...conditions))
      .orderBy(desc(clipboardsTable.created_at))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(clipboardsTable)
      .where(and(...conditions));

    const total = totalResult[0]?.count ?? 0;

    // Transform entries for response
    const transformedEntries: ClipboardEntry[] = entries.map((entry) => ({
      uuid: entry.uuid,
      name: entry.name,
      idx: entry.idx,
      value: entry.value,
      contentType: entry.content_type,
      encoding: entry.encoding,
      sizeBytes: entry.size_bytes,
      visibility: entry.visibility,
      createdByTool: entry.created_by_tool,
      createdByModel: entry.created_by_model,
      createdAt: entry.created_at.toISOString(),
      updatedAt: entry.updated_at.toISOString(),
      expiresAt: entry.expires_at?.toISOString() ?? null,
    }));

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

// Size limit: 256KB
const MAX_SIZE_BYTES = 262144;

// Default TTL: 24 hours
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

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

    // Calculate size in bytes
    const sizeBytes = Buffer.byteLength(options.value, 'utf-8');
    if (sizeBytes > MAX_SIZE_BYTES) {
      return {
        success: false,
        error: `Value exceeds maximum size of ${MAX_SIZE_BYTES} bytes (${Math.round(MAX_SIZE_BYTES / 1024)}KB)`,
      };
    }

    // Calculate expiration
    const ttlMs = options.ttlSeconds
      ? options.ttlSeconds * 1000
      : DEFAULT_TTL_MS;
    const expiresAt = new Date(Date.now() + ttlMs);

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
            expires_at: entryData.expires_at,
            updated_at: new Date(),
          },
        })
        .returning();
    } else {
      // Indexed entry: check if exists first
      const existing = await db
        .select({ uuid: clipboardsTable.uuid })
        .from(clipboardsTable)
        .where(
          and(
            eq(clipboardsTable.profile_uuid, profileUuid),
            eq(clipboardsTable.idx, options.idx!)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        return {
          success: false,
          error: `Index ${options.idx} already exists. Use push for auto-increment or delete first.`,
        };
      }

      result = await db
        .insert(clipboardsTable)
        .values(entryData)
        .returning();
    }

    const entry = result[0];
    return {
      success: true,
      entry: {
        uuid: entry.uuid,
        name: entry.name,
        idx: entry.idx,
        value: entry.value,
        contentType: entry.content_type,
        encoding: entry.encoding,
        sizeBytes: entry.size_bytes,
        visibility: entry.visibility,
        createdByTool: entry.created_by_tool,
        createdByModel: entry.created_by_model,
        createdAt: entry.created_at.toISOString(),
        updatedAt: entry.updated_at.toISOString(),
        expiresAt: entry.expires_at?.toISOString() ?? null,
      },
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

    const conditions = [eq(clipboardsTable.profile_uuid, profileUuid)];

    if (options.name !== undefined) {
      conditions.push(eq(clipboardsTable.name, options.name));
    }

    if (options.idx !== undefined) {
      conditions.push(eq(clipboardsTable.idx, options.idx));
    }

    const result = await db
      .delete(clipboardsTable)
      .where(and(...conditions))
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
 * Get clipboard stats
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

    const entries = await db
      .select({
        sizeBytes: clipboardsTable.size_bytes,
        expiresAt: clipboardsTable.expires_at,
        contentType: clipboardsTable.content_type,
      })
      .from(clipboardsTable)
      .where(eq(clipboardsTable.profile_uuid, profileUuid));

    const now = new Date();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const expiringToday = entries.filter((entry) => {
      if (!entry.expiresAt) return false;
      return entry.expiresAt <= endOfDay && entry.expiresAt >= now;
    }).length;

    const uniqueContentTypes = new Set(entries.map((e) => e.contentType));

    return {
      success: true,
      stats: {
        total: entries.length,
        totalSize: entries.reduce((acc, entry) => acc + entry.sizeBytes, 0),
        expiringToday,
        contentTypes: uniqueContentTypes.size,
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
