import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { memoryRingTable } from '@/db/schema';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../../auth';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/memory/ring/[id] - Get memory details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    // Validate UUID format
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid memory ID format' },
        { status: 400 }
      );
    }

    const [memory] = await db
      .select()
      .from(memoryRingTable)
      .where(
        and(
          eq(memoryRingTable.uuid, id),
          eq(memoryRingTable.profile_uuid, auth.activeProfile.uuid)
        )
      )
      .limit(1);

    if (!memory) {
      return NextResponse.json(
        { success: false, error: 'Memory not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: memory });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/memory/ring/[id] - Delete a memory
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    // Validate UUID format
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid memory ID format' },
        { status: 400 }
      );
    }

    const result = await db
      .delete(memoryRingTable)
      .where(
        and(
          eq(memoryRingTable.uuid, id),
          eq(memoryRingTable.profile_uuid, auth.activeProfile.uuid)
        )
      )
      .returning({ uuid: memoryRingTable.uuid });

    if (result.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Memory not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
