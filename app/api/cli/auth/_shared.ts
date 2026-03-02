import { and, eq, gt } from 'drizzle-orm';
import { getServerSession } from 'next-auth/next';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { deviceAuthCodesTable } from '@/db/schema';
import { createErrorResponse, ErrorResponses } from '@/lib/api-errors';
import { authOptions } from '@/lib/auth';
import { createRateLimiter } from '@/lib/rate-limiter';

export const authActionRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 10,
});

const userCodeSchema = z.object({
  user_code: z.string().min(1).max(12),
});

type DeviceAuthRecord = typeof deviceAuthCodesTable.$inferSelect;

type ValidatedRequest =
  | { ok: true; record: DeviceAuthRecord; session: { user: { id: string } }; userCode: string; body: Record<string, unknown> }
  | { ok: false; response: NextResponse };

/**
 * Shared validation for approve/deny endpoints:
 * - Rate limiting
 * - Session authentication
 * - JSON body parsing + Zod validation
 * - Device auth code lookup by user_code
 * - Status check (must be 'pending')
 * - Expiration check (auto-expires stale codes)
 *
 * Returns the full parsed body so callers can extract additional fields.
 */
export async function validateDeviceAuthAction(
  request: NextRequest,
): Promise<ValidatedRequest> {
  const rateLimitResult = await authActionRateLimiter(request);
  if (!rateLimitResult.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' },
        { status: 429 }
      ),
    };
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false, response: ErrorResponses.unauthorized() };
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: ErrorResponses.badRequest('Invalid JSON body') };
  }

  const validated = userCodeSchema.safeParse(body);
  if (!validated.success) {
    return { ok: false, response: ErrorResponses.badRequest('Invalid request parameters') };
  }

  const { user_code } = validated.data;

  // Look up only pending, non-expired codes to avoid matching stale records
  // that could shadow a fresh pending code with the same user_code
  const record = await db.query.deviceAuthCodesTable.findFirst({
    where: and(
      eq(deviceAuthCodesTable.user_code, user_code),
      eq(deviceAuthCodesTable.status, 'pending'),
      gt(deviceAuthCodesTable.expires_at, new Date())
    ),
  });

  if (!record) {
    // Check if there's a non-pending record to give a more specific error
    const anyRecord = await db.query.deviceAuthCodesTable.findFirst({
      where: eq(deviceAuthCodesTable.user_code, user_code),
    });

    if (!anyRecord) {
      return { ok: false, response: ErrorResponses.notFound() };
    }

    if (anyRecord.status !== 'pending') {
      return {
        ok: false,
        response: createErrorResponse('Authorization code already used', 409, 'ALREADY_USED'),
      };
    }

    // Must be expired
    await db.update(deviceAuthCodesTable)
      .set({ status: 'expired' })
      .where(eq(deviceAuthCodesTable.uuid, anyRecord.uuid));
    return {
      ok: false,
      response: createErrorResponse('Authorization code expired', 410, 'EXPIRED'),
    };
  }

  return {
    ok: true,
    record,
    session: session as { user: { id: string } },
    userCode: user_code,
    body,
  };
}
