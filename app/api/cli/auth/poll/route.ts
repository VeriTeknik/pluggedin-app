import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { apiKeysTable, deviceAuthCodesTable } from '@/db/schema';
import { createErrorResponse, ErrorResponses } from '@/lib/api-errors';
import { createRateLimiter } from '@/lib/rate-limiter';

const pollRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 100,
});

const pollSchema = z.object({
  device_code: z.string().min(1).max(64),
});

export async function GET(request: NextRequest) {
  const rateLimitResult = await pollRateLimiter(request);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' },
      { status: 429 }
    );
  }

  const deviceCode = request.nextUrl.searchParams.get('device_code');
  const validated = pollSchema.safeParse({ device_code: deviceCode });
  if (!validated.success) {
    return ErrorResponses.badRequest('Invalid device_code');
  }

  const record = await db.query.deviceAuthCodesTable.findFirst({
    where: eq(deviceAuthCodesTable.device_code, validated.data.device_code),
  });

  if (!record) {
    return ErrorResponses.notFound();
  }

  // Auto-expire stale pending codes
  if (new Date() > record.expires_at) {
    if (record.status === 'pending') {
      await db.update(deviceAuthCodesTable)
        .set({ status: 'expired' })
        .where(eq(deviceAuthCodesTable.uuid, record.uuid));
    }
    return NextResponse.json({ status: 'expired' }, { status: 410 });
  }

  switch (record.status) {
    case 'pending':
      return NextResponse.json({ status: 'authorization_pending' });

    case 'approved': {
      if (!record.api_key_uuid) {
        return createErrorResponse('Internal error', 500);
      }
      const apiKey = await db.query.apiKeysTable.findFirst({
        where: eq(apiKeysTable.uuid, record.api_key_uuid),
        columns: { api_key: true },
      });
      if (!apiKey) {
        return createErrorResponse('API key not found', 500);
      }

      // Mark as consumed so the API key cannot be retrieved again
      await db.update(deviceAuthCodesTable)
        .set({ status: 'consumed' })
        .where(eq(deviceAuthCodesTable.uuid, record.uuid));

      return NextResponse.json({
        status: 'approved',
        api_key: apiKey.api_key,
      });
    }

    case 'consumed':
      return NextResponse.json({ status: 'approved' });

    case 'denied':
      return NextResponse.json({ status: 'denied' }, { status: 403 });

    case 'expired':
      return NextResponse.json({ status: 'expired' }, { status: 410 });

    default:
      return createErrorResponse('Unknown status', 500);
  }
}
