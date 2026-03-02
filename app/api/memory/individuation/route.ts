import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  getIndividuationHistory,
  getIndividuationScore,
} from '@/lib/memory/jungian/individuation-service';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../auth';

const historySchema = z.object({
  history: z.enum(['true', 'false']).optional(),
  days: z.number().int().min(1).max(365).optional(),
});

/**
 * GET /api/memory/individuation - Get individuation score or history
 *
 * Default: returns current individuation score.
 * With ?history=true&days=30: returns daily score snapshots for trend charts.
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

    const parsed = historySchema.safeParse({
      history: searchParams.get('history') || undefined,
      days: searchParams.get('days') ? Number(searchParams.get('days')) : undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const profileUuid = auth.activeProfile.uuid;

    if (parsed.data.history === 'true') {
      const days = parsed.data.days ?? 30;
      const result = await getIndividuationHistory(profileUuid, days);
      return NextResponse.json(result);
    }

    const result = await getIndividuationScore(profileUuid);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
