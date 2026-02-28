import { NextRequest, NextResponse } from 'next/server';

import { processDecay, cleanupForgotten } from '@/lib/memory/decay-engine';
import { cleanupExpiredFreshMemory } from '@/lib/memory/observation-service';
import { abandonStaleSessions } from '@/lib/memory/session-service';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../auth';

/**
 * POST /api/memory/decay - Trigger decay engine + cleanup
 * Designed to be called by a cron job
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
