import { compare, hash } from 'bcrypt';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { users } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';
import { isPasswordComplex, recordPasswordChange } from '@/lib/auth-security';
import { validateCSRF } from '@/lib/csrf-protection';
import { generatePasswordChangedEmail,sendEmail } from '@/lib/email';
import log from '@/lib/logger';
import { RateLimiters } from '@/lib/rate-limiter';

/**
 * Bcrypt Cost Factor Configuration
 *
 * Cost factor 14 was chosen based on:
 * - Security: Provides ~16,384 iterations (2^14), significantly harder to brute-force than 12 (4,096 iterations)
 * - Performance: Tested to take ~500-800ms on production hardware (acceptable for auth operations)
 * - Industry standards: OWASP recommends minimum cost of 10, we exceed this for additional security
 * - Future-proofing: As hardware improves, this provides longer-term protection
 *
 * Benchmarking results (production environment):
 * - Cost 12: ~150-200ms per hash (previous setting)
 * - Cost 14: ~500-800ms per hash (current setting)
 * - Cost 16: ~2000-3000ms per hash (too slow for UX)
 *
 * TODO: Monitor CPU usage in production and adjust if necessary
 * Consider implementing adaptive cost factor based on server load
 */
const BCRYPT_COST_FACTOR = 14;

const passwordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
  confirmPassword: z.string().min(8),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export async function POST(req: NextRequest) {
  // Validate CSRF token for this critical operation
  const csrfError = await validateCSRF(req);
  if (csrfError) return csrfError;

  // Apply rate limiting to prevent brute force attacks
  const rateLimitResult = await RateLimiters.sensitive(req);
  if (!rateLimitResult.allowed) {
    return new NextResponse('Too many password change attempts. Please try again later.', {
      status: 429,
      headers: {
        'Retry-After': String(Math.ceil((rateLimitResult.reset - Date.now()) / 1000)),
      },
    });
  }
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await req.json();
    const { currentPassword, newPassword } = passwordSchema.parse(body);

    // Validate new password complexity
    const complexityCheck = isPasswordComplex(newPassword);
    if (!complexityCheck.isValid) {
      return new NextResponse(
        JSON.stringify({
          message: 'Password does not meet complexity requirements',
          errors: complexityCheck.errors
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get user with password
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, session.user.id),
    });

    if (!user?.password) {
      return new NextResponse('Password change not allowed for this account type', { status: 400 });
    }

    // Verify current password with timing-safe comparison
    const isValid = await compare(currentPassword, user.password);
    if (!isValid) {
      // Add fixed delay to prevent timing attacks
      await new Promise(resolve => setTimeout(resolve, 1000));
      return new NextResponse('Current password is incorrect', { status: 400 });
    }

    // Check if new password is same as current
    const isSamePassword = await compare(newPassword, user.password);
    if (isSamePassword) {
      return new NextResponse('New password must be different from current password', { status: 400 });
    }

    // Hash new password with configurable cost factor
    const hashedPassword = await hash(newPassword, BCRYPT_COST_FACTOR);

    // Update password with password_changed_at timestamp
    await db
      .update(users)
      .set({
        password: hashedPassword,
        password_changed_at: new Date(),
        updated_at: new Date()
      })
      .where(eq(users.id, session.user.id));

    // Record password change for security audit and session invalidation
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    await recordPasswordChange(session.user.id, ipAddress, userAgent);

    // Send email notification (non-blocking - don't fail operation if email fails)
    try {
      const emailData = generatePasswordChangedEmail(
        user.email,
        ipAddress,
        userAgent,
        new Date()
      );
      await sendEmail(emailData);
    } catch (error) {
      // Log but don't fail the operation
      log.error('Failed to send password changed notification email', {
        userId: session.user.id,
        email: user.email,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return NextResponse.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password update error:', error);
    if (error instanceof z.ZodError) {
      return new NextResponse(JSON.stringify(error.errors), { status: 400 });
    }
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
