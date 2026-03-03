import { and, eq } from 'drizzle-orm';
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

      // Atomically mark as consumed and retrieve the API key
      // The WHERE status='approved' guard prevents two simultaneous polls
      // from both retrieving the key
      let result: { api_key: string } | null;
      try {
        result = await db.transaction(async (tx) => {
          const updated = await tx.update(deviceAuthCodesTable)
            .set({ status: 'consumed' })
            .where(
              and(
                eq(deviceAuthCodesTable.uuid, record.uuid),
                eq(deviceAuthCodesTable.status, 'approved')
              )
            )
            .returning({ uuid: deviceAuthCodesTable.uuid });

          if (updated.length === 0) {
            // Another poll already consumed this — treat as consumed
            return null;
          }

          const apiKey = await tx.query.apiKeysTable.findFirst({
            where: eq(apiKeysTable.uuid, record.api_key_uuid!),
            columns: { api_key: true },
          });

          if (!apiKey) {
            // API key row was deleted — roll back the consumed transition
            throw new Error('API_KEY_MISSING');
          }

          return apiKey;
        });
      } catch (err) {
        if (err instanceof Error && err.message === 'API_KEY_MISSING') {
          return createErrorResponse('Internal error', 500);
        }
        throw err;
      }

      if (!result) {
        // Already consumed by a concurrent poll
        return NextResponse.json({ status: 'approved' });
      }

      return NextResponse.json({
        status: 'approved',
        api_key: result.api_key,
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
