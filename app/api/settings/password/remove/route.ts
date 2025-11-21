import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { users } from '@/db/schema';
import { recordPasswordChange } from '@/lib/auth-security';
import { validateCSRF } from '@/lib/csrf-protection';
import log from '@/lib/logger';
import { createErrorResponse } from '@/lib/api-errors';
import { RateLimiters } from '@/lib/rate-limiter';
import { sendEmail, generatePasswordRemovedEmail } from '@/lib/email';

const removePasswordSchema = z.object({
  confirmEmail: z.string().email(),
});

/**
 * @swagger
 * /api/settings/password/remove:
 *   post:
 *     summary: Remove password from user account
 *     description: Allows users to remove their password if they have OAuth accounts linked. Requires email confirmation.
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
 *               - confirmEmail
 *             properties:
 *               confirmEmail:
 *                 type: string
 *                 format: email
 *                 description: User's email address for confirmation
 *     responses:
 *       200:
 *         description: Password removed successfully
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
 *                   example: Password removed successfully
 *       400:
 *         description: Bad Request - Invalid input or cannot remove only login method
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
    const { confirmEmail } = removePasswordSchema.parse(body);

    // Get user with accounts to check login methods
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      with: {
        accounts: true,
      },
    });

    if (!user) {
      return createErrorResponse('User not found', 404, 'USER_NOT_FOUND');
    }

    // Verify email confirmation matches
    if (user.email !== confirmEmail) {
      log.warn('Password removal attempted with mismatched email', {
        userId: user.id,
        userEmail: user.email,
        confirmEmail,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Email confirmation does not match',
        },
        { status: 400 }
      );
    }

    // Check if user has a password
    if (!user.password) {
      return NextResponse.json(
        {
          success: false,
          error: 'No password is set for this account',
        },
        { status: 400 }
      );
    }

    // CRITICAL: Check if user has at least one OAuth account
    // Don't allow removal if password is the only login method
    if (user.accounts.length === 0) {
      log.warn('Password removal blocked - no OAuth accounts', {
        userId: user.id,
        email: user.email,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot remove password. It\'s your only login method. Please connect an OAuth account first.',
        },
        { status: 400 }
      );
    }

    // Remove the password and update password_changed_at timestamp
    await db
      .update(users)
      .set({
        password: null,
        password_changed_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(users.id, user.id));

    // Record password change for security audit and session management
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    await recordPasswordChange(user.id, ipAddress, userAgent);

    // Send email notification (non-blocking - don't fail operation if email fails)
    const remainingLoginMethods = user.accounts.map((a) => a.provider);
    try {
      const emailData = generatePasswordRemovedEmail(
        user.email,
        ipAddress,
        userAgent,
        new Date(),
        remainingLoginMethods
      );
      await sendEmail(emailData);
    } catch (error) {
      // Log but don't fail the operation
      log.error('Failed to send password removed notification email', {
        userId: user.id,
        email: user.email,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Log the security event
    log.info('Password removed from account', {
      userId: user.id,
      email: user.email,
      remainingLoginMethods,
      accountCount: user.accounts.length,
      ipAddress,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Password removed successfully. You can now only sign in with OAuth.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Password removal error:', error);

    if (error instanceof z.ZodError) {
      return createErrorResponse('Invalid input data', 400, 'VALIDATION_ERROR');
    }

    return createErrorResponse(
      'Failed to remove password. Please try again.',
      500,
      'SERVER_ERROR'
    );
  }
}
