import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { queryIntuition } from '@/lib/memory/gut-agent';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../../auth';

const querySchema = z.object({
  query: z.string().min(1).max(1000),
  topK: z.number().int().min(1).max(50).optional(),
});

/**
 * GET /api/memory/sync/patterns - Query synchronicity patterns
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
      query: searchParams.get('query'),
      topK: searchParams.get('topK') ? Number(searchParams.get('topK')) : undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { query, topK } = parsed.data;
    const result = await queryIntuition(query, topK ?? 5);

    if (!result.success) {
      return NextResponse.json(result, { status: 500 });
    }

    // Filter to synchronicity patterns only
    const filtered = (result.data ?? []).filter(
      (p) => p.patternType === 'synchronicity'
    );

    return NextResponse.json({ success: true, data: filtered });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
