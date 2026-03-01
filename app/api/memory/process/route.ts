import { createHmac, timingSafeEqual } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';

import { classifyBatch } from '@/lib/memory/analytics-agent';

import { authenticate } from '../../auth';

/**
 * Timing-safe comparison of secret strings.
 *
 * Uses HMAC-SHA256 digests so timingSafeEqual always compares 32-byte
 * buffers — no early return on length mismatch leaks the secret's length.
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
 * POST /api/memory/process - Trigger analytics agent batch classification
 * Requires CRON_SECRET header to prevent abuse (each call triggers LLM invocations).
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate via CRON_SECRET first — cron callers are exempt from API
    // rate limiting since they run on a fixed schedule with a shared secret.
    if (!verifyCronSecret(request.headers.get('x-cron-secret'))) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: this endpoint requires cron authorization' },
        { status: 403 }
      );
    }

    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    const result = await classifyBatch(auth.activeProfile.uuid);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
