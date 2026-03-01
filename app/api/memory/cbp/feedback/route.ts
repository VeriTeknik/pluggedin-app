import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { submitFeedback } from '@/lib/memory/cbp/injection-engine';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';
import { FEEDBACK_TYPE_VALUES } from '@/lib/memory/types';

import { authenticate } from '../../../auth';

const feedbackSchema = z.object({
  pattern_uuid: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  feedback_type: z.enum(FEEDBACK_TYPE_VALUES),
  comment: z.string().max(1000).optional(),
});

/**
 * POST /api/memory/cbp/feedback - Submit feedback on a collective pattern
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

    const body = await request.json();
    const parsed = feedbackSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    if (!auth.activeProfile) {
      return NextResponse.json(
        { success: false, error: 'No active profile found' },
        { status: 401 }
      );
    }

    const result = await submitFeedback(
      parsed.data.pattern_uuid,
      auth.activeProfile.uuid,
      parsed.data.rating,
      parsed.data.feedback_type,
      parsed.data.comment
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
