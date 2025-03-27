import { nanoid } from 'nanoid';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { passwordResetTokens } from '@/db/schema';
import { generatePasswordResetEmail,sendEmail } from '@/lib/email';

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
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