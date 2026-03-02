import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { verifyCronSecret } from '@/lib/cron-auth';
import { processDreams } from '@/lib/memory/jungian/dream-processor';

const bodySchema = z.object({
  profile_uuid: z.string().uuid(),
});

/**
 * POST /api/memory/dream/process - Trigger dream processing (memory consolidation)
 * Restricted: requires CRON_SECRET header.
 *
 * SECURITY: CRON_SECRET carries admin-equivalent privileges — it grants the
 * ability to trigger dream processing for ANY profile_uuid. Treat CRON_SECRET
 * with the same sensitivity as a database password.
 *
 * TODO: Remove profile_uuid from the request body and iterate all active
 * profiles server-side (via DB query) to eliminate the lateral access vector.
 * Until then, CRON_SECRET compromise = full cross-profile processing access.
 */
export async function POST(request: NextRequest) {
  try {
    if (!verifyCronSecret(request.headers.get('x-cron-secret'))) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: this endpoint requires cron authorization' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await processDreams(parsed.data.profile_uuid);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
