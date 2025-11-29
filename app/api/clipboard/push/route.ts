import { sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { authenticateApiKey } from '@/app/api/auth';
import { db } from '@/db';
import { clipboardsTable } from '@/db/schema';
import { RATE_LIMITS,rateLimit } from '@/lib/api-rate-limit';
import {
  calculateClipboardSize,
  calculateExpirationDate,
  validateClipboardSize,
  validateContentEncoding,
} from '@/lib/clipboard';

// Rate limiter for push (write) operations
const pushLimiter = rateLimit(RATE_LIMITS.clipboardWrite);

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
  // Apply rate limiting
  const rateLimitResponse = await pushLimiter(request);
  if (rateLimitResponse) return rateLimitResponse;

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

    // Validate content matches declared encoding
    const encodingError = validateContentEncoding(validatedBody.value, validatedBody.encoding);
    if (encodingError) {
      return NextResponse.json({ error: encodingError }, { status: 400 });
    }

    const sizeBytes = calculateClipboardSize(validatedBody.value);
    const expiresAt = calculateExpirationDate(validatedBody.ttlSeconds);

    // Use atomic INSERT with subquery to avoid race conditions
    // The subquery calculates next index at INSERT time, within the same transaction
    const maxRetries = 5;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Atomic insert with inline subquery for next index
        // This runs in a single statement, avoiding the read-then-write race
        const result = await db.execute(sql`
          INSERT INTO ${clipboardsTable} (
            profile_uuid, name, idx, value, content_type, encoding,
            size_bytes, visibility, created_by_tool, created_by_model, expires_at
          )
          SELECT
            ${activeProfile.uuid}::uuid,
            NULL,
            COALESCE((SELECT MAX(idx) FROM ${clipboardsTable} WHERE profile_uuid = ${activeProfile.uuid}::uuid), -1) + 1,
            ${validatedBody.value},
            ${validatedBody.contentType},
            ${validatedBody.encoding},
            ${sizeBytes},
            ${validatedBody.visibility},
            ${validatedBody.createdByTool ?? null},
            ${validatedBody.createdByModel ?? null},
            ${expiresAt}
          RETURNING *
        `);

        const row = result.rows[0] as Record<string, unknown>;
        if (!row) {
          throw new Error('Insert failed to return row');
        }

        // Transform the raw row to ClipboardEntry
        return NextResponse.json({
          success: true,
          entry: {
            uuid: row.uuid as string,
            name: row.name as string | null,
            idx: row.idx as number | null,
            value: row.value as string,
            contentType: row.content_type as string,
            encoding: row.encoding as string,
            sizeBytes: row.size_bytes as number,
            visibility: row.visibility as string,
            createdByTool: row.created_by_tool as string | null,
            createdByModel: row.created_by_model as string | null,
            createdAt: row.created_at as Date,
            updatedAt: row.updated_at as Date,
            expiresAt: row.expires_at as Date | null,
          },
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message.toLowerCase();

        // Check for unique constraint violation (concurrent push)
        if (errorMessage.includes('unique') || errorMessage.includes('duplicate') || errorMessage.includes('23505')) {
          if (attempt < maxRetries - 1) {
            // Exponential backoff with jitter to reduce contention
            const baseDelay = 10 * Math.pow(2, attempt);
            const jitter = Math.random() * baseDelay * 0.5;
            await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
            continue;
          }
        }
        throw error;
      }
    }

    // All retries exhausted
    console.error('Push failed after retries:', lastError);
    return NextResponse.json(
      { error: 'Failed to push after concurrent conflicts. Please retry.' },
      { status: 409 }
    );
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
