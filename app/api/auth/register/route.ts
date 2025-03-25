import { hash } from 'bcrypt';
import { nanoid } from 'nanoid';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { users, verificationTokens } from '@/db/schema';

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

    // Send verification email (would typically use an email provider)
    // For development purposes, we'll just return the token in the response
    // In production, you would use a service like SendGrid, Mailgun, etc.
    
    // Example code for sending email (commented out):
    // await sendVerificationEmail({
    //   to: data.email,
    //   subject: 'Verify your email',
    //   token: verificationToken
    // });

    return NextResponse.json(
      { 
        message: 'User registered successfully! Please verify your email.',
        // In production, you would remove the line below
        verificationToken: verificationToken
      },
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