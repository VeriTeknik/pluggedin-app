import { NextRequest, NextResponse } from 'next/server';

import { fetchMemoryRing } from '@/lib/memory/queries';
import type { RingType } from '@/lib/memory/types';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../auth';

/**
 * GET /api/memory/ring - List memory ring entries
 * Uses authenticate() which supports both session and API key auth.
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
    const ringType = searchParams.get('ring_type') as RingType | null;
    const agentUuid = searchParams.get('agent_uuid') ?? undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 200);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10) || 0;

    const memories = await fetchMemoryRing({
      profileUuid: auth.activeProfile.uuid,
      ringType,
      agentUuid,
      limit,
      offset,
    });

    return NextResponse.json({ success: true, data: memories });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
