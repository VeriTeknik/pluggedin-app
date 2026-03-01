import { createHmac, timingSafeEqual } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  injectContextual,
  injectPostErrorSuggestion,
  injectProactiveWarning,
} from '@/lib/memory/cbp/injection-engine';
import { runPromotionPipeline } from '@/lib/memory/cbp/promotion-service';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../auth';

/**
 * Timing-safe comparison of secret strings.
 *
 * Why HMAC-SHA256 digests? Both `a` and `b` are always exactly 32 bytes
 * regardless of input length, so timingSafeEqual never leaks the secret's
 * length through an early-return on Buffer.length mismatch.
 */
function verifyCronSecret(provided: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !provided) return false;
  const key = Buffer.from(expected);
  const a = createHmac('sha256', key).update(provided).digest();
  const b = createHmac('sha256', key).update(expected).digest();
  return timingSafeEqual(a, b);
}

const cbpQuerySchema = z.object({
  query: z.string().min(1).max(2000),
  context: z.enum(['proactive_warning', 'post_error', 'contextual']).optional(),
  tool_name: z.string().max(200).optional(),
  error_message: z.string().max(1000).optional(),
});

/**
 * GET /api/memory/cbp - Query collective best practices
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

    const parsed = cbpQuerySchema.safeParse({
      query: searchParams.get('query'),
      context: searchParams.get('context') || undefined,
      tool_name: searchParams.get('tool_name') || undefined,
      error_message: searchParams.get('error_message') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { query, context, tool_name, error_message } = parsed.data;

    let result;
    switch (context) {
      case 'proactive_warning':
        result = await injectProactiveWarning(tool_name || query, query);
        break;
      case 'post_error':
        result = await injectPostErrorSuggestion(error_message || query, tool_name);
        break;
      default:
        result = await injectContextual(query);
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/memory/cbp - Trigger CBP promotion pipeline
 * Restricted: requires CRON_SECRET header (cross-profile operation).
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate via CRON_SECRET first — cron callers are exempt from API
    // rate limiting since they already have a shared secret and run on a
    // fixed schedule. Checking auth before rate limit avoids consuming user
    // quota for legitimate cron invocations.
    if (!verifyCronSecret(request.headers.get('x-cron-secret'))) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: this endpoint requires cron authorization' },
        { status: 403 }
      );
    }

    const result = await runPromotionPipeline();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
