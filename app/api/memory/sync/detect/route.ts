import { NextRequest, NextResponse } from 'next/server';

import { verifyCronSecret } from '@/lib/cron-auth';
import { SYNC_CRON_ENABLED } from '@/lib/memory/jungian/constants';
import { detectSynchronicities } from '@/lib/memory/jungian/synchronicity-detector';

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
