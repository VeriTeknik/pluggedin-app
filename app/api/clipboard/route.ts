import { desc, eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { authenticateApiKey } from '@/app/api/auth';
import { db } from '@/db';
import { clipboardsTable } from '@/db/schema';
import { RATE_LIMITS,rateLimit } from '@/lib/api-rate-limit';
import {
  buildClipboardConditions,
  calculateClipboardSize,
  calculateExpirationDate,
  toClipboardEntries,
  toClipboardEntry,
  validateClipboardSize,
  validateContentEncoding,
} from '@/lib/clipboard';

// Rate limiters
const readLimiter = rateLimit(RATE_LIMITS.clipboardRead);
const writeLimiter = rateLimit(RATE_LIMITS.clipboardWrite);
const deleteLimiter = rateLimit(RATE_LIMITS.clipboardDelete);

// Maximum limit cap to prevent abuse
const MAX_LIMIT = 1000;

// Query parameters schema for GET
const getClipboardSchema = z.object({
  name: z.string().optional(),
  idx: z.coerce.number().int().optional(),
  contentType: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// Request body schema for POST
const setClipboardSchema = z.object({
  name: z.string().max(255).optional(),
  idx: z.number().int().optional(),
  value: z.string(),
  contentType: z.string().max(256).optional().default('text/plain'),
  encoding: z.enum(['utf-8', 'base64', 'hex']).optional().default('utf-8'),
  visibility: z.enum(['private', 'workspace', 'public']).optional().default('private'),
  createdByTool: z.string().max(255).optional(),
  createdByModel: z.string().max(255).optional(),
  source: z.enum(['ui', 'sdk', 'mcp']).optional().default('ui'),
  ttlSeconds: z.number().int().positive().optional(),
}).refine((data) => data.name !== undefined || data.idx !== undefined, {
  message: 'Either name or idx must be provided',
});

// Request body schema for DELETE
const deleteClipboardSchema = z.object({
  name: z.string().optional(),
  idx: z.number().int().optional(),
  clearAll: z.boolean().optional().default(false),
}).refine((data) => data.clearAll || data.name !== undefined || data.idx !== undefined, {
  message: 'Either name, idx, or clearAll must be provided',
});

/**
 * GET /api/clipboard
 * List all clipboard entries or get by name/index
 */
export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = await readLimiter(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const apiKeyResult = await authenticateApiKey(request);
    if (apiKeyResult.error) {
      return apiKeyResult.error;
    }

    const { activeProfile } = apiKeyResult;

    // Parse query parameters using destructuring
    const { searchParams } = request.nextUrl;
    const params = {
      name: searchParams.get('name') || undefined,
      idx: searchParams.get('idx') || undefined,
      contentType: searchParams.get('contentType') || undefined,
      limit: searchParams.get('limit') || '50',
      offset: searchParams.get('offset') || '0',
    };

    const validatedParams = getClipboardSchema.parse(params);

    // Build query conditions using shared helper
    // API endpoints use 'all' scope for authenticated access to own data
    // MCP tools should see all their own entries regardless of visibility setting
    const where = buildClipboardConditions({
      profileUuid: activeProfile.uuid,
      name: validatedParams.name,
      idx: validatedParams.idx,
      contentType: validatedParams.contentType,
      visibilityScope: 'all', // Authenticated users can see all their own entries
    });

    // Execute query
    const entries = await db
      .select()
      .from(clipboardsTable)
      .where(where)
      .orderBy(desc(clipboardsTable.created_at))
      .limit(validatedParams.limit)
      .offset(validatedParams.offset);

    // Get total count for pagination
    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(clipboardsTable)
      .where(where);

    const total = totalResult[0]?.count ?? 0;

    // Transform entries for response using shared helper
    const transformedEntries = toClipboardEntries(entries, { thumbnailForImages: true });

    // If requesting single entry by name or idx, return just that entry
    if (validatedParams.name !== undefined || validatedParams.idx !== undefined) {
      if (entries.length === 0) {
        return NextResponse.json(
          { error: 'Clipboard entry not found' },
          { status: 404 }
        );
      }
      // Return full value for single entry
      return NextResponse.json({
        entry: toClipboardEntry(entries[0], { thumbnailForImages: false }),
      });
    }

    return NextResponse.json({
      entries: transformedEntries,
      total,
      limit: validatedParams.limit,
      offset: validatedParams.offset,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error fetching clipboard:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/clipboard
 * Set a clipboard entry (upsert for named, error if idx exists)
 */
export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = await writeLimiter(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const apiKeyResult = await authenticateApiKey(request);
    if (apiKeyResult.error) {
      return apiKeyResult.error;
    }

    const { activeProfile } = apiKeyResult;

    const body = await request.json();
    const validatedBody = setClipboardSchema.parse(body);

    // Validate size using shared helper
    const sizeError = validateClipboardSize(validatedBody.value);
    if (sizeError) {
      return NextResponse.json(
        { error: sizeError },
        { status: 400 }
      );
    }

    // Validate content matches declared encoding
    const encodingError = validateContentEncoding(validatedBody.value, validatedBody.encoding);
    if (encodingError) {
      return NextResponse.json(
        { error: encodingError },
        { status: 400 }
      );
    }

    const sizeBytes = calculateClipboardSize(validatedBody.value);
    const expiresAt = calculateExpirationDate(validatedBody.ttlSeconds);

    const entryData = {
      profile_uuid: activeProfile.uuid,
      name: validatedBody.name ?? null,
      idx: validatedBody.idx ?? null,
      value: validatedBody.value,
      content_type: validatedBody.contentType,
      encoding: validatedBody.encoding,
      size_bytes: sizeBytes,
      visibility: validatedBody.visibility,
      created_by_tool: validatedBody.createdByTool ?? null,
      created_by_model: validatedBody.createdByModel ?? null,
      source: validatedBody.source,
      expires_at: expiresAt,
      updated_at: new Date(),
    };

    let result;

    if (validatedBody.name !== undefined) {
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
        return NextResponse.json(
          { error: 'Conflict with existing entry. Use push for auto-increment or delete first.' },
          { status: 409 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      entry: toClipboardEntry(result[0]),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error setting clipboard:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/clipboard
 * Delete clipboard entry by name/index or clear all
 */
export async function DELETE(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = await deleteLimiter(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const apiKeyResult = await authenticateApiKey(request);
    if (apiKeyResult.error) {
      return apiKeyResult.error;
    }

    const { activeProfile } = apiKeyResult;

    const body = await request.json();
    const validatedBody = deleteClipboardSchema.parse(body);

    if (validatedBody.clearAll) {
      // Delete all entries for this profile
      const result = await db
        .delete(clipboardsTable)
        .where(eq(clipboardsTable.profile_uuid, activeProfile.uuid))
        .returning({ uuid: clipboardsTable.uuid });

      return NextResponse.json({
        success: true,
        deleted: result.length,
      });
    }

    // Build conditions using shared helper
    // Users can delete any of their own entries regardless of visibility
    const where = buildClipboardConditions({
      profileUuid: activeProfile.uuid,
      name: validatedBody.name,
      idx: validatedBody.idx,
      visibilityScope: 'all', // Allow deleting any own entry
    });

    const result = await db
      .delete(clipboardsTable)
      .where(where)
      .returning({ uuid: clipboardsTable.uuid });

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Clipboard entry not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      deleted: result.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error deleting clipboard:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
