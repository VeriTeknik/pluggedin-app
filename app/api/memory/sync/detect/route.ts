import { createHmac, timingSafeEqual } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';

import { SYNC_CRON_ENABLED } from '@/lib/memory/jungian/constants';
import { detectSynchronicities } from '@/lib/memory/jungian/synchronicity-detector';

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
 * POST /api/memory/sync/detect - Detect synchronicity patterns
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

    if (!SYNC_CRON_ENABLED) {
      return NextResponse.json(
        { success: false, error: 'Synchronicity detection cron is disabled' },
        { status: 503 }
      );
    }

    const result = await detectSynchronicities();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
