import { hash } from 'bcrypt';
import { nanoid } from 'nanoid';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { users, verificationTokens } from '@/db/schema';
import { notifyAdminsOfNewUser } from '@/lib/admin-notifications';
import { createErrorResponse, ErrorResponses } from '@/lib/api-errors';
import { generateVerificationEmail, sendEmail } from '@/lib/email';
import { RateLimiters } from '@/lib/rate-limiter';
import { sendWelcomeEmail } from '@/lib/welcome-emails';

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
});

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Creates a new user account, hashes the password, generates an email verification token, and sends a verification email.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 description: The user's full name.
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The user's email address. Must be unique.
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 description: The user's desired password (at least 8 characters).
 *     responses:
 *       201:
 *         description: User registered successfully. Verification email sent.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User registered successfully! Please verify your email.
 *                 # Development-only fields (remove from production docs if desired)
 *                 verificationToken:
 *                   type: string
 *                   description: (Development Only) The generated verification token.
 *                 verificationUrl:
 *                   type: string
 *                   format: url
 *                   description: (Development Only) The full URL to verify the email.
 *       400:
 *         description: Bad Request - Invalid input data (e.g., email format, password length).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Invalid input data
 *                 errors:
 *                   type: array # Zod error details
 *                   items:
 *                     type: object
 *       409:
 *         description: Conflict - A user with the provided email already exists.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User with this email already exists
 *       500:
 *         description: Internal Server Error - Failed to register user or send verification email.
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
  // Apply rate limiting
  const rateLimitResult = await RateLimiters.auth(req);
  if (!rateLimitResult.allowed) {
    return createErrorResponse(
      'Too many requests. Please try again later.',
      429,
      'RATE_LIMIT_EXCEEDED'
    );
  }
  
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
    const userId = nanoid();
    await db.insert(users).values({
      id: userId,
      name: data.name,
      email: data.email,
      password: hashedPassword,
      emailVerified: null, // Email not verified yet
      created_at: new Date(),
      updated_at: new Date(),
    });
    
    // Send admin notification using the new centralized service
    await notifyAdminsOfNewUser({
      name: data.name,
      email: data.email,
      id: userId,
      source: 'email',
    });
    
    // Send welcome email to the user
    await sendWelcomeEmail({
      name: data.name,
      email: data.email,
      signupSource: 'email',
      userId,
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

    // Never expose verification tokens in the response
    return NextResponse.json(
      { 
        message: 'User registered successfully! Please check your email for verification instructions.'
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    
    if (error instanceof z.ZodError) {
      return ErrorResponses.validationError('Invalid input data');
    }
    
    return ErrorResponses.serverError();
  }
}
