import { NextRequest, NextResponse } from 'next/server';

import { verifyCronSecret } from '@/lib/cron-auth';
import { processDecay, cleanupForgotten } from '@/lib/memory/decay-engine';
import { cleanupExpiredFreshMemory } from '@/lib/memory/observation-service';
import { abandonStaleSessions } from '@/lib/memory/session-service';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../auth';

/**
 * POST /api/memory/decay - Trigger decay engine + cleanup
 *
 * Two modes:
 * 1. Cron mode (x-cron-secret only): processes ALL profiles
 * 2. User mode (Bearer token + x-cron-secret): processes only the authenticated user's profile
 */
export async function POST(request: NextRequest) {
  try {
    // CRON_SECRET is always required
    if (!verifyCronSecret(request.headers.get('x-cron-secret'))) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: this endpoint requires cron authorization' },
        { status: 403 }
      );
    }

    // If Bearer token is provided, scope to that user's profile
    let profileUuid: string | undefined;
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const rateLimitResult = await EnhancedRateLimiters.api(request);
      if (!rateLimitResult.allowed) {
        return NextResponse.json(
          { error: 'Too many requests', retryAfter: rateLimitResult.retryAfter },
          { status: 429 }
        );
      }

      const auth = await authenticate(request);
      if (auth.error) return auth.error;
      profileUuid = auth.activeProfile.uuid;
    }

    // Run maintenance tasks — undefined profileUuid means all profiles
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
