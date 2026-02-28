import { timingSafeEqual } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';

import { processDecay, cleanupForgotten } from '@/lib/memory/decay-engine';
import { cleanupExpiredFreshMemory } from '@/lib/memory/observation-service';
import { abandonStaleSessions } from '@/lib/memory/session-service';
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

/**
 * POST /api/memory/decay - Trigger decay engine + cleanup
 * Designed to be called by a cron job. Requires CRON_SECRET header.
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

    // Require CRON_SECRET to prevent regular users from triggering decay
    if (!verifyCronSecret(request.headers.get('x-cron-secret'))) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: this endpoint requires cron authorization' },
        { status: 403 }
      );
    }

    const profileUuid = auth.activeProfile.uuid;

    // Run maintenance tasks scoped to the authenticated user's profile
    const [decayResult, forgottenCount, expiredCount, abandonedCount] = await Promise.all([
      processDecay(profileUuid),
      cleanupForgotten(profileUuid),
      cleanupExpiredFreshMemory(profileUuid),
      abandonStaleSessions(profileUuid),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        decay: decayResult.success ? decayResult.data : { error: decayResult.error },
        forgottenCleaned: forgottenCount,
        expiredFreshCleaned: expiredCount,
        staleSessionsAbandoned: abandonedCount,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
