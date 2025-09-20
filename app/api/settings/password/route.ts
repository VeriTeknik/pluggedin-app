import { compare, hash } from 'bcrypt';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { users } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';
import { RateLimiters } from '@/lib/rate-limiter';

// Bcrypt cost factor: higher values increase security but also CPU usage.
// Monitor server load and adjust as needed for your environment.
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

    // Update password
    await db
      .update(users)
      .set({ 
        password: hashedPassword,
        updated_at: new Date()
      })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password update error:', error);
    if (error instanceof z.ZodError) {
      return new NextResponse(JSON.stringify(error.errors), { status: 400 });
    }
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
