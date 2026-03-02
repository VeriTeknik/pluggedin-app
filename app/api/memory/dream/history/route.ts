import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { dreamConsolidationsTable } from '@/db/schema';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../../auth';

const querySchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

/**
 * GET /api/memory/dream/history - Get dream consolidation history
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = await EnhancedRateLimiters.api(request);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: rateLimitResult.retryAfter },
        { status: 429 }
      );
    }

    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);

    const parsed = querySchema.safeParse({
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
      offset: searchParams.get('offset') ? Number(searchParams.get('offset')) : undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const limit = parsed.data.limit ?? 20;
    const offset = parsed.data.offset ?? 0;

    const records = await db
      .select()
      .from(dreamConsolidationsTable)
      .where(eq(dreamConsolidationsTable.profile_uuid, auth.activeProfile.uuid))
      .orderBy(desc(dreamConsolidationsTable.created_at))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ success: true, data: records });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
