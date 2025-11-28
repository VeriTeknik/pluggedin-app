import { eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { authenticateApiKey } from '@/app/api/auth';
import { db } from '@/db';
import { clipboardsTable } from '@/db/schema';
import {
  calculateClipboardSize,
  validateClipboardSize,
  calculateExpirationDate,
  toClipboardEntry,
} from '@/lib/clipboard';

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

    // Validate size using shared helper
    const sizeError = validateClipboardSize(validatedBody.value);
    if (sizeError) {
      return NextResponse.json({ error: sizeError }, { status: 400 });
    }

    const sizeBytes = calculateClipboardSize(validatedBody.value);
    const expiresAt = calculateExpirationDate(validatedBody.ttlSeconds);

    // Retry logic to handle race conditions with concurrent pushes
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Get the next index (max idx + 1, or 0 if no entries)
        const maxIdxResult = await db
          .select({ maxIdx: sql<number>`COALESCE(MAX(${clipboardsTable.idx}), -1)` })
          .from(clipboardsTable)
          .where(eq(clipboardsTable.profile_uuid, activeProfile.uuid));

        const nextIdx = (maxIdxResult[0]?.maxIdx ?? -1) + 1;

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
          entry: toClipboardEntry(result[0]),
        });
      } catch (error) {
        // Check for unique constraint violation (race condition)
        const errorMessage = error instanceof Error ? error.message : '';
        if (errorMessage.includes('unique') || errorMessage.includes('duplicate')) {
          if (attempt < maxRetries - 1) {
            // Retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
            continue;
          }
        }
        throw error;
      }
    }

    // Should not reach here, but TypeScript needs a return
    return NextResponse.json({ error: 'Failed after retries' }, { status: 500 });
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
