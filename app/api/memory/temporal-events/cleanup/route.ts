import { createHmac, timingSafeEqual } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';

import { cleanupTemporalEvents } from '@/lib/memory/jungian/temporal-event-service';

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

/**
 * POST /api/memory/temporal-events/cleanup - Cleanup old temporal events
 * Restricted: requires CRON_SECRET header.
 */
export async function POST(request: NextRequest) {
  try {
    if (!verifyCronSecret(request.headers.get('x-cron-secret'))) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: this endpoint requires cron authorization' },
        { status: 403 }
      );
    }

    const result = await cleanupTemporalEvents();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
