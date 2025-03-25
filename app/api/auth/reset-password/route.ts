import { hash } from 'bcrypt';
import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { passwordResetTokens, users } from '@/db/schema';

const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = resetPasswordSchema.parse(body);

    // Find the reset token
    const resetToken = await db.query.passwordResetTokens.findFirst({
      where: (tokens, { eq }) => eq(tokens.token, data.token),
    });

    if (!resetToken) {
      return NextResponse.json(
        { message: 'Invalid or expired reset token' },
        { status: 400 }
      );
    }

    // Check if the token has expired
    if (new Date() > new Date(resetToken.expires)) {
      return NextResponse.json(
        { message: 'Reset token has expired' },
        { status: 400 }
      );
    }

    // Find the user with the matching email
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, resetToken.identifier),
    });

    if (!user) {
      return NextResponse.json(
        { message: 'User not found' },
        { status: 404 }
      );
    }

    // Hash the new password
    const hashedPassword = await hash(data.password, 10);

    // Update the user's password
    await db
      .update(users)
      .set({
        password: hashedPassword,
        updated_at: new Date(),
      })
      .where(eq(users.id, user.id));

    // Delete the reset token
    await db
      .delete(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.identifier, resetToken.identifier),
          eq(passwordResetTokens.token, resetToken.token)
        )
      );

    return NextResponse.json(
      { message: 'Password has been reset successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Reset password error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid input', errors: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { message: 'Something went wrong' },
      { status: 500 }
    );
  }
} 