import { hash } from 'bcrypt';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { users } from '@/db/schema';
import { nanoid } from 'nanoid';

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = registerSchema.parse(body);

    // Check if user already exists
    const existingUser = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, data.email),
    });

    if (existingUser) {
      return NextResponse.json(
        { message: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Hash the password
    const hashedPassword = await hash(data.password, 10);

    // Create the user
    await db.insert(users).values({
      id: nanoid(),
      name: data.name,
      email: data.email,
      // Store password hash in email verification token
      // It will be moved to the user record once email is verified
      emailVerified: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Send verification email
    // This would typically use the email provider from next-auth

    return NextResponse.json(
      { message: 'User registered successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid registration data', errors: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { message: 'Something went wrong' },
      { status: 500 }
    );
  }
} 