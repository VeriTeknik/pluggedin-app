import { timingSafeEqual } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { queryIntuition, aggregatePatterns } from '@/lib/memory/gut-agent';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../auth';

/**
 * Timing-safe comparison of secret strings to prevent timing attacks.
 */
function verifyCronSecret(provided: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

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
    const topKParam = searchParams.get('top_k');

    // Validate query parameter
    if (!query || query.length === 0 || query.length > 1000) {
      return NextResponse.json(
        { success: false, error: 'query parameter is required and must be 1-1000 characters' },
        { status: 400 }
      );
    }

    // Validate top_k parameter
    let topK: number | undefined;
    if (topKParam) {
      const parsed = parseInt(topKParam, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 20) {
        return NextResponse.json(
          { success: false, error: 'top_k must be an integer between 1 and 20' },
          { status: 400 }
        );
      }
      topK = parsed;
    }

    const result = await queryIntuition(query, topK);
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
 * Designed to be called by a weekly cron job.
 * Restricted: requires CRON_SECRET header for authorization since this
 * is a cross-profile operation that should not be triggered by regular users.
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

    // This is a global cross-profile operation designed for cron jobs.
    // Require CRON_SECRET header to prevent regular users from triggering it.
    if (!verifyCronSecret(request.headers.get('x-cron-secret'))) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: this endpoint requires cron authorization' },
        { status: 403 }
      );
    }

    const result = await aggregatePatterns();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
