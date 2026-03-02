import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { deviceAuthCodesTable } from '@/db/schema';

import { validateDeviceAuthAction } from '../_shared';

export async function POST(request: NextRequest) {
  const result = await validateDeviceAuthAction(request);
  if (!result.ok) return result.response;

  await db.update(deviceAuthCodesTable)
    .set({ status: 'denied' })
    .where(eq(deviceAuthCodesTable.uuid, result.record.uuid));

  return NextResponse.json({ status: 'denied' });
}
