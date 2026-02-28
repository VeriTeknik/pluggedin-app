import { NextRequest, NextResponse } from 'next/server';

import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../auth';
import { getMemoryRing } from '../../../actions/memory';

/**
 * GET /api/memory/ring - List memory ring entries
 * Delegates to the getMemoryRing server action to avoid duplicated query logic.
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
    const ringType = searchParams.get('ring_type') as 'procedures' | 'practice' | 'longterm' | 'shocks' | null;
    const agentUuid = searchParams.get('agent_uuid') ?? undefined;
    const limit = parseInt(searchParams.get('limit') ?? '50', 10) || 50;
    const offset = parseInt(searchParams.get('offset') ?? '0', 10) || 0;

    const result = await getMemoryRing(auth.user.id, {
      ringType: ringType ?? undefined,
      limit: Math.min(limit, 200),
      offset,
      agentUuid,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
