import { desc, eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { authenticateApiKey } from '@/app/api/auth';
import { db } from '@/db';
import { clipboardsTable } from '@/db/schema';

// Size limit: 256KB
const MAX_SIZE_BYTES = 262144;

// Default TTL: 24 hours
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

// Request body schema for push
const pushClipboardSchema = z.object({
  value: z.string(),
  contentType: z.string().max(256).optional().default('text/plain'),
  encoding: z.enum(['utf-8', 'base64', 'hex']).optional().default('utf-8'),
  visibility: z.enum(['private', 'workspace', 'public']).optional().default('private'),
  createdByTool: z.string().max(255).optional(),
  createdByModel: z.string().max(255).optional(),
  ttlSeconds: z.number().int().positive().optional(),
});

/**
 * POST /api/clipboard/push
 * Push a new entry to the indexed clipboard (auto-increment index)
 */
export async function POST(request: NextRequest) {
  try {
    const apiKeyResult = await authenticateApiKey(request);
    if (apiKeyResult.error) {
      return apiKeyResult.error;
    }

    const { activeProfile } = apiKeyResult;

    const body = await request.json();
    const validatedBody = pushClipboardSchema.parse(body);

    // Calculate size in bytes
    const sizeBytes = Buffer.byteLength(validatedBody.value, 'utf-8');
    if (sizeBytes > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: `Value exceeds maximum size of ${MAX_SIZE_BYTES} bytes (${Math.round(MAX_SIZE_BYTES / 1024)}KB)` },
        { status: 400 }
      );
    }

    // Get the next index (max idx + 1, or 0 if no entries)
    const maxIdxResult = await db
      .select({ maxIdx: sql<number>`COALESCE(MAX(${clipboardsTable.idx}), -1)` })
      .from(clipboardsTable)
      .where(eq(clipboardsTable.profile_uuid, activeProfile.uuid));

    const nextIdx = (maxIdxResult[0]?.maxIdx ?? -1) + 1;

    // Calculate expiration
    const ttlMs = validatedBody.ttlSeconds
      ? validatedBody.ttlSeconds * 1000
      : DEFAULT_TTL_MS;
    const expiresAt = new Date(Date.now() + ttlMs);

    // Insert new entry
    const result = await db
      .insert(clipboardsTable)
      .values({
        profile_uuid: activeProfile.uuid,
        name: null,
        idx: nextIdx,
        value: validatedBody.value,
        content_type: validatedBody.contentType,
        encoding: validatedBody.encoding,
        size_bytes: sizeBytes,
        visibility: validatedBody.visibility,
        created_by_tool: validatedBody.createdByTool ?? null,
        created_by_model: validatedBody.createdByModel ?? null,
        expires_at: expiresAt,
      })
      .returning();

    return NextResponse.json({
      success: true,
      entry: {
        uuid: result[0].uuid,
        idx: result[0].idx,
        contentType: result[0].content_type,
        encoding: result[0].encoding,
        sizeBytes: result[0].size_bytes,
        visibility: result[0].visibility,
        createdAt: result[0].created_at,
        updatedAt: result[0].updated_at,
        expiresAt: result[0].expires_at,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error pushing to clipboard:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
