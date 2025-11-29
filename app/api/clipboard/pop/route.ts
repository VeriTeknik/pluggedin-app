import { and, desc, eq, isNotNull } from 'drizzle-orm';
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

    // Find the entry with the highest index
    const entries = await db
      .select()
      .from(clipboardsTable)
      .where(
        and(
          eq(clipboardsTable.profile_uuid, activeProfile.uuid),
          isNotNull(clipboardsTable.idx)
        )
      )
      .orderBy(desc(clipboardsTable.idx))
      .limit(1);

    if (entries.length === 0) {
      return NextResponse.json(
        { error: 'No indexed entries to pop' },
        { status: 404 }
      );
    }

    const entry = entries[0];

    // Delete the entry
    await db
      .delete(clipboardsTable)
      .where(eq(clipboardsTable.uuid, entry.uuid));

    return NextResponse.json({
      success: true,
      entry: {
        uuid: entry.uuid,
        idx: entry.idx,
        value: entry.value,
        contentType: entry.content_type,
        encoding: entry.encoding,
        sizeBytes: entry.size_bytes,
        visibility: entry.visibility,
        createdByTool: entry.created_by_tool,
        createdByModel: entry.created_by_model,
        createdAt: entry.created_at,
        updatedAt: entry.updated_at,
        expiresAt: entry.expires_at,
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
