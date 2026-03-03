import { NextRequest, NextResponse } from 'next/server';
import { customAlphabet } from 'nanoid';

import { db } from '@/db';
import { deviceAuthCodesTable } from '@/db/schema';
import { USER_CODE_ALPHABET } from '@/lib/cli-auth-constants';
import { createRateLimiter } from '@/lib/rate-limiter';

const initiateRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
});

const deviceCodeGen = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  48
);

const userCodeGen = customAlphabet(USER_CODE_ALPHABET, 8);

const DEVICE_CODE_TTL_SECONDS = 300; // 5 minutes

export async function POST(request: NextRequest) {
  const rateLimitResult = await initiateRateLimiter(request);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' },
      { status: 429 }
    );
  }

  const baseUrl = process.env.NEXTAUTH_URL;
  if (!baseUrl) {
    return NextResponse.json(
      { error: 'Server configuration error', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }

  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const clientIp = forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown';

  const deviceCode = deviceCodeGen();
  const rawUserCode = userCodeGen();
  const userCode = `${rawUserCode.slice(0, 4)}-${rawUserCode.slice(4)}`;

  const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_SECONDS * 1000);

  await db.insert(deviceAuthCodesTable).values({
    device_code: deviceCode,
    user_code: userCode,
    status: 'pending',
    client_ip: clientIp,
    expires_at: expiresAt,
  });

  // user_code in the URL is an accepted trade-off per RFC 8628 §3.3.
  // It is short-lived (5 min TTL), single-use, and acts as the implicit
  // CSRF token for the authorize page. The page sets no outbound links,
  // so Referer leakage is not a concern. client_ip is for audit logging
  // only and is not used in any security decision.
  const verificationUrl = `${baseUrl}/cli/authorize?code=${encodeURIComponent(userCode)}`;

  return NextResponse.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_url: verificationUrl,
    expires_in: DEVICE_CODE_TTL_SECONDS,
    interval: 5,
  });
}
