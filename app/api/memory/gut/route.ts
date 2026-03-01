import { createHmac, timingSafeEqual } from 'crypto';

import { sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { queryIntuition, aggregatePatterns } from '@/lib/memory/gut-agent';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../auth';

/**
 * Timing-safe comparison of secret strings.
 *
 * Uses HMAC-SHA256 digests so timingSafeEqual always compares 32-byte
 * buffers — no early return on length mismatch leaks the secret's length.
 */
function verifyCronSecret(provided: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !provided) return false;
  const key = Buffer.from(expected);
  const a = createHmac('sha256', key).update(provided).digest();
  const b = createHmac('sha256', key).update(expected).digest();
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

    const parsed = gutQuerySchema.safeParse({
      query: searchParams.get('query'),
      top_k: searchParams.get('top_k') ? Number(searchParams.get('top_k')) : undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await queryIntuition(parsed.data.query, parsed.data.top_k);
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
    // Authenticate via CRON_SECRET first — cron callers are exempt from API
    // rate limiting since they run on a fixed schedule with a shared secret.
    if (!verifyCronSecret(request.headers.get('x-cron-secret'))) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: this endpoint requires cron authorization' },
        { status: 403 }
      );
    }

    // Postgres advisory lock prevents concurrent aggregation runs.
    const GUT_AGGREGATION_LOCK_KEY = 738202;
    const lockResult = await db.execute(
      sql`SELECT pg_try_advisory_lock(${GUT_AGGREGATION_LOCK_KEY}) AS acquired`
    );
    const acquired = (lockResult.rows[0] as { acquired: boolean } | undefined)?.acquired;

    if (!acquired) {
      return NextResponse.json(
        { success: false, error: 'Aggregation already running' },
        { status: 409 }
      );
    }

    try {
      const result = await aggregatePatterns();
      return NextResponse.json(result);
    } finally {
      await db.execute(sql`SELECT pg_advisory_unlock(${GUT_AGGREGATION_LOCK_KEY})`);
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
