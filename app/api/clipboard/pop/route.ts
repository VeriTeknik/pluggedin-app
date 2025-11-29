import { sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { authenticateApiKey } from '@/app/api/auth';
import { db } from '@/db';
import { clipboardsTable } from '@/db/schema';
import { RATE_LIMITS,rateLimit } from '@/lib/api-rate-limit';

// Pop is destructive, use delete rate limit
const popLimiter = rateLimit(RATE_LIMITS.clipboardDelete);

/**
 * POST /api/clipboard/pop
 * Pop the highest-indexed entry (LIFO behavior)
 *
 * Uses atomic DELETE...RETURNING with a subquery to prevent race conditions.
 * If two concurrent requests pop, each gets a different entry (or one gets 404).
 */
export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = await popLimiter(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const apiKeyResult = await authenticateApiKey(request);
    if (apiKeyResult.error) {
      return apiKeyResult.error;
    }

    const { activeProfile } = apiKeyResult;

    // Atomic pop: DELETE the highest-indexed entry in a single operation
    // The subquery finds the max idx, and we delete that specific row
    // This prevents race conditions where two concurrent pops could read the same entry
    const result = await db.execute(sql`
      DELETE FROM ${clipboardsTable}
      WHERE uuid = (
        SELECT uuid FROM ${clipboardsTable}
        WHERE profile_uuid = ${activeProfile.uuid}::uuid
          AND idx IS NOT NULL
        ORDER BY idx DESC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'No indexed entries to pop' },
        { status: 404 }
      );
    }

    const row = result.rows[0] as Record<string, unknown>;

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
    console.error('Error popping from clipboard:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
