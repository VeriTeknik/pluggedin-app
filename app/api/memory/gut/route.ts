import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { queryIntuition, aggregatePatterns } from '@/lib/memory/gut-agent';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../auth';

const gutQuerySchema = z.object({
  query: z.string().min(1).max(1000),
  top_k: z.number().int().min(1).max(20).optional(),
});

/**
 * GET /api/memory/gut - Query collective wisdom
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
    const query = searchParams.get('query');
    const topK = searchParams.get('top_k');

    if (!query) {
      return NextResponse.json(
        { success: false, error: 'query parameter is required' },
        { status: 400 }
      );
    }

    const result = await queryIntuition(query, topK ? parseInt(topK, 10) : undefined);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/memory/gut - Trigger gut pattern aggregation
 * Designed to be called by a weekly cron job
 */
export async function POST(request: NextRequest) {
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

    const result = await aggregatePatterns();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
