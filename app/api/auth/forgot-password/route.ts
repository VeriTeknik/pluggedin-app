import { nanoid } from 'nanoid';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { passwordResetTokens } from '@/db/schema';
import { createErrorResponse } from '@/lib/api-errors';
import { generatePasswordResetEmail, sendEmail } from '@/lib/email';
import { RateLimiters } from '@/lib/rate-limiter';

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Initiate password reset
 *     description: |
 *       Starts the password reset process for a given email address.
 *       If the email exists in the system, it generates a password reset token, stores it, and sends an email containing a reset link.
 *       **Important:** For security reasons (to prevent email enumeration), this endpoint **always returns a 200 OK** response with a generic message, regardless of whether the email address was found or not.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The email address of the user requesting the password reset.
 *     responses:
 *       200:
 *         description: Password reset process initiated (or simulated if email not found).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: If your email is registered, you will receive a password reset link.
 *                 # Development-only fields (remove from production docs if desired)
 *                 resetToken:
 *                   type: string
 *                   description: (Development Only) The generated password reset token.
 *                 resetUrl:
 *                   type: string
 *                   format: url
 *                   description: (Development Only) The full URL to reset the password.
 *       400:
 *         description: Bad Request - Invalid email address format.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Invalid email address
 *                 errors:
 *                   type: array # Zod error details
 *                   items:
 *                     type: object
 *       500:
 *         description: Internal Server Error - Failed to process the request or send the email.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Something went wrong
 */
export async function POST(req: NextRequest) {
  // Apply rate limiting - stricter for password reset
  const rateLimitResult = await RateLimiters.sensitive(req);
  if (!rateLimitResult.allowed) {
    return createErrorResponse(
      'Too many password reset attempts. Please try again later.',
      429,
      'RATE_LIMIT_EXCEEDED'
    );
  }
  
  try {
    const body = await req.json();
    const { email } = forgotPasswordSchema.parse(body);

    // Check if user exists
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, email),
    });

    // Even if user doesn't exist, we return success for security reasons
    // This prevents email enumeration attacks
    if (!user) {
      return NextResponse.json(
        { message: 'If your email is registered, you will receive a password reset link.' },
        { status: 200 }
      );
    }

    // Generate a reset token
    const resetToken = nanoid(32);
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 2); // Token valid for 2 hours

    // Store the reset token
    await db.insert(passwordResetTokens).values({
      identifier: email,
      token: resetToken,
      expires: tokenExpiry,
    });

    // Send the password reset email
    const emailSent = await sendEmail(generatePasswordResetEmail(email, resetToken));
    
    // Log whether the email was sent for debugging
    if (!emailSent) {
      console.warn(`Failed to send password reset email to ${email}`);
    }

    // For development, we'll also return the token for easier testing
    const isDev = process.env.NODE_ENV === 'development';
    return NextResponse.json(
      { 
        message: 'If your email is registered, you will receive a password reset link.',
        // Include token in development mode only
        ...(isDev && { resetToken, resetUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:12005'}/reset-password?token=${resetToken}` })
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Forgot password error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid email address', errors: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { message: 'Something went wrong' },
      { status: 500 }
    );
  }
}
