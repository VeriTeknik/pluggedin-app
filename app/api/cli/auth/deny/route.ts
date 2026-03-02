import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { deviceAuthCodesTable } from '@/db/schema';
import { createErrorResponse } from '@/lib/api-errors';

import { validateDeviceAuthAction } from '../_shared';

export async function POST(request: NextRequest) {
  const result = await validateDeviceAuthAction(request);
  if (!result.ok) return result.response;

  const updated = await db.update(deviceAuthCodesTable)
    .set({ status: 'denied' })
    .where(
      and(
        eq(deviceAuthCodesTable.uuid, result.record.uuid),
        eq(deviceAuthCodesTable.status, 'pending')
      )
    )
    .returning({ uuid: deviceAuthCodesTable.uuid });

  if (updated.length === 0) {
    return createErrorResponse('Authorization code already used or expired', 409, 'CONFLICT');
  }

  return NextResponse.json({ status: 'denied' });
}
