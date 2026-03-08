import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { freshMemoryTable } from '@/db/schema';
import { verifyCronSecret } from '@/lib/cron-auth';
import { classifyBatch } from '@/lib/memory/analytics-agent';

import { authenticate } from '../../auth';

/**
 * POST /api/memory/process - Trigger analytics agent batch classification
 *
 * Two modes:
 * 1. Cron mode (x-cron-secret only): processes ALL profiles with unclassified memories
 * 2. User mode (Bearer token + x-cron-secret): processes only the authenticated user's profile
 */
export async function POST(request: NextRequest) {
  try {
    // CRON_SECRET is always required — this endpoint triggers LLM calls
    if (!verifyCronSecret(request.headers.get('x-cron-secret'))) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: this endpoint requires cron authorization' },
        { status: 403 }
      );
    }

    // If Bearer token is provided, scope to that user's profile only
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const auth = await authenticate(request);
      if (auth.error) return auth.error;
      const result = await classifyBatch(auth.activeProfile.uuid);
      return NextResponse.json(result);
    }

    // Cron mode: process all profiles with unclassified fresh memories
    const profileRows = await db
      .selectDistinct({ profile_uuid: freshMemoryTable.profile_uuid })
      .from(freshMemoryTable)
      .where(eq(freshMemoryTable.classified, false));

    const results: Array<{ profileUuid: string; classified: number; errors: number }> = [];

    for (const row of profileRows) {
      try {
        const result = await classifyBatch(row.profile_uuid);
        results.push({
          profileUuid: row.profile_uuid,
          classified: result.success && result.data ? result.data.length : 0,
          errors: 0,
        });
      } catch {
        results.push({
          profileUuid: row.profile_uuid,
          classified: 0,
          errors: 1,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        profilesProcessed: results.length,
        results,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
