import { hash } from 'bcrypt';
import { nanoid } from 'nanoid';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { users, verificationTokens } from '@/db/schema';
import { generateVerificationEmail,sendEmail } from '@/lib/email';

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
    
    // Generate a verification token
    const verificationToken = nanoid(32);
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 24); // Token valid for 24 hours

    // Create the user
    await db.insert(users).values({
      id: nanoid(),
      name: data.name,
      email: data.email,
      password: hashedPassword,
      emailVerified: null, // Email not verified yet
      created_at: new Date(),
      updated_at: new Date(),
    });
    
    // Store the verification token
    await db.insert(verificationTokens).values({
      identifier: data.email,
      token: verificationToken,
      expires: tokenExpiry,
    });

    // Send the verification email
    const emailSent = await sendEmail(generateVerificationEmail(data.email, verificationToken));
    
    // Log whether the email was sent for debugging
    if (!emailSent) {
      console.warn(`Failed to send verification email to ${data.email}`);
    }

    // For development purposes, we'll also return the token in the response
    // In production, this would be removed
    const isDev = process.env.NODE_ENV === 'development';
    return NextResponse.json(
      { 
        message: 'User registered successfully! Please verify your email.',
        // Include token in development mode only
        ...(isDev && { 
          verificationToken, 
          verificationUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:12005'}/verify-email?token=${verificationToken}` 
        })
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid input data', errors: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { message: 'Something went wrong' },
      { status: 500 }
    );
  }
} 