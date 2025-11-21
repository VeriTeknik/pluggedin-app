import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { hash } from 'bcrypt';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { users } from '@/db/schema';
import log from '@/lib/logger';
import { createErrorResponse } from '@/lib/api-errors';
import { isPasswordComplex, recordPasswordChange } from '@/lib/auth-security';
import { validateCSRF } from '@/lib/csrf-protection';
import { RateLimiters } from '@/lib/rate-limiter';
import { sendEmail, generatePasswordSetEmail } from '@/lib/email';

/**
 * Bcrypt Cost Factor Configuration
 *
 * Cost factor 14 was chosen based on:
 * - Security: Provides ~16,384 iterations (2^14)
 * - Performance: ~500-800ms on production hardware
 * - Industry standards: OWASP recommends minimum cost of 10
 * - Consistency: Matches cost factor used in registration and password change
 */
const BCRYPT_COST_FACTOR = 14;

const setPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

/**
 * @swagger
 * /api/settings/password/set:
 *   post:
 *     summary: Set password for OAuth-only user
 *     description: Allows users who registered with OAuth to add a password for email/password login.
 *     tags:
 *       - Settings
 *     security:
 *       - SessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPassword
 *               - confirmPassword
 *             properties:
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 description: The new password to set
 *               confirmPassword:
 *                 type: string
 *                 format: password
 *                 description: Confirmation of the new password
 *     responses:
 *       200:
 *         description: Password set successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Password set successfully
 *       400:
 *         description: Bad Request - Invalid input or password already exists
 *       401:
 *         description: Unauthorized - Not authenticated
 *       429:
 *         description: Too Many Requests - Rate limit exceeded
 *       500:
 *         description: Internal Server Error
 */
export async function POST(req: NextRequest) {
  // SECURITY: Validate CSRF token for this critical operation
  const csrfError = await validateCSRF(req);
  if (csrfError) return csrfError;

  // Apply rate limiting for sensitive operations
  const rateLimitResult = await RateLimiters.sensitive(req);
  if (!rateLimitResult.allowed) {
    return createErrorResponse(
      'Too many requests. Please try again later.',
      429,
      'RATE_LIMIT_EXCEEDED'
    );
  }

  try {
    // SECURITY: Get authenticated session - user ID is derived from session, not client input
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return createErrorResponse('Unauthorized', 401, 'UNAUTHORIZED');
    }

    // Parse and validate request body
    const body = await req.json();
    const { newPassword } = setPasswordSchema.parse(body);

    // Get user
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user) {
      return createErrorResponse('User not found', 404, 'USER_NOT_FOUND');
    }

    // Check if user already has a password
    if (user.password) {
      return NextResponse.json(
        {
          success: false,
          error: 'Password already exists. Use the change password option instead.',
        },
        { status: 400 }
      );
    }

    // Validate password complexity
    const complexityCheck = isPasswordComplex(newPassword);
    if (!complexityCheck.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Password does not meet complexity requirements',
          details: complexityCheck.errors,
        },
        { status: 400 }
      );
    }

    // Hash the new password with consistent cost factor
    const hashedPassword = await hash(newPassword, BCRYPT_COST_FACTOR);

    // Update user with new password and password_changed_at timestamp
    await db
      .update(users)
      .set({
        password: hashedPassword,
        password_changed_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(users.id, user.id));

    // Record password change for security audit and session management
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    await recordPasswordChange(user.id, ipAddress, userAgent);

    // Send email notification (non-blocking - don't fail operation if email fails)
    try {
      const emailData = generatePasswordSetEmail(
        user.email,
        ipAddress,
        userAgent,
        new Date()
      );
      await sendEmail(emailData);
    } catch (error) {
      // Log but don't fail the operation
      log.error('Failed to send password set notification email', {
        userId: user.id,
        email: user.email,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Log the security event
    log.info('Password set for OAuth user', {
      userId: user.id,
      email: user.email,
      ipAddress,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Password set successfully. You can now sign in with email/password.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Password set error:', error);

    if (error instanceof z.ZodError) {
      return createErrorResponse('Invalid input data', 400, 'VALIDATION_ERROR');
    }

    return createErrorResponse(
      'Failed to set password. Please try again.',
      500,
      'SERVER_ERROR'
    );
  }
}
