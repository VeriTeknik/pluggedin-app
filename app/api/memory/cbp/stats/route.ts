import { NextRequest, NextResponse } from 'next/server';

import { getPromotionStats } from '@/lib/memory/cbp/promotion-service';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../../auth';

/**
 * GET /api/memory/cbp/stats - Get CBP statistics
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

    const result = await getPromotionStats();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
