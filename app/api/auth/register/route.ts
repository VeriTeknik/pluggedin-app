import { hash } from 'bcrypt';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { users, verificationTokens } from '@/db/schema';
import { notifyAdminsOfNewUser } from '@/lib/admin-notifications';
import { createErrorResponse, ErrorResponses } from '@/lib/api-errors';
import { isPasswordComplex } from '@/lib/auth-security';
import { createDefaultProject } from '@/lib/default-project-creation';
import { generateVerificationEmail, sendEmail } from '@/lib/email';
import log from '@/lib/logger';
import { RateLimiters } from '@/lib/rate-limiter';
import { sendWelcomeEmail } from '@/lib/welcome-emails';

/**
 * Bcrypt Cost Factor Configuration
 *
 * Cost factor 14 was chosen based on:
 * - Security: Provides ~16,384 iterations (2^14), significantly harder to brute-force than 12 (4,096 iterations)
 * - Performance: Tested to take ~500-800ms on production hardware (acceptable for auth operations)
 * - Industry standards: OWASP recommends minimum cost of 10, we exceed this for additional security
 * - Future-proofing: As hardware improves, this provides longer-term protection
 * - Consistency: Matches the cost factor used in password change operations
 */
const BCRYPT_COST_FACTOR = 14;

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

    // Validate password complexity
    const complexityCheck = isPasswordComplex(data.password);
    if (!complexityCheck.isValid) {
      return NextResponse.json(
        {
          message: 'Password does not meet complexity requirements',
          errors: complexityCheck.errors
        },
        { status: 400 }
      );
    }

    // Hash the password with consistent cost factor (do this early to save time)
    const hashedPassword = await hash(data.password, BCRYPT_COST_FACTOR);

    // Generate a verification token
    const verificationToken = nanoid(32);
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 24); // Token valid for 24 hours

    // Use a transaction to handle the check-delete-insert atomically
    // This prevents race conditions where concurrent requests could create duplicates
    let userId: string;

    try {
      // Try to create the user - unique constraint will prevent duplicates
      userId = nanoid();
      await db.insert(users).values({
        id: userId,
        name: data.name,
        email: data.email,
        password: hashedPassword,
        emailVerified: null, // Email not verified yet
        created_at: new Date(),
        updated_at: new Date(),
      });

      log.info('New user created successfully', {
        email: data.email,
        userId,
      });
    } catch (error: any) {
      // Check if this is a unique constraint violation (PostgreSQL error code 23505)
      if (error.code === '23505' && error.constraint === 'users_email_unique') {
        // User with this email already exists - check if we can replace them
        log.info('Email already exists, checking if replaceable', {
          email: data.email,
        });

        // Use a transaction with SELECT FOR UPDATE to prevent race conditions
        // This locks the row so other concurrent requests must wait
        const result = await db.transaction(async (tx) => {
          // Lock and fetch the existing user with SELECT FOR UPDATE
          // This prevents concurrent transactions from modifying the same user
          const [existingUser] = await tx
            .select()
            .from(users)
            .where(eq(users.email, data.email))
            .for('update');

          if (!existingUser) {
            // User was deleted by another request, should not happen due to lock
            throw new Error('RETRY_INSERT');
          }

          // Fetch accounts separately (we have the user locked now)
          const userAccounts = await tx.query.accounts.findMany({
            where: (accounts, { eq }) => eq(accounts.userId, existingUser.id),
          });

          // Block if user has verified email or OAuth accounts
          if (existingUser.emailVerified || userAccounts.length > 0) {
            log.info('Registration blocked - email is verified or has OAuth', {
              email: data.email,
              hasVerifiedEmail: !!existingUser.emailVerified,
              hasOAuthAccounts: userAccounts.length > 0,
            });
            return { success: false, verified: true };
          }

          // Delete the unverified user and create new one atomically
          log.info('Replacing unverified user', {
            email: data.email,
            oldUserId: existingUser.id,
          });

          await tx.delete(users).where(eq(users.id, existingUser.id));

          // Create new user with same email
          userId = nanoid();
          await tx.insert(users).values({
            id: userId,
            name: data.name,
            email: data.email,
            password: hashedPassword,
            emailVerified: null,
            created_at: new Date(),
            updated_at: new Date(),
          });

          return { success: true, userId };
        });

        if (!result.success) {
          if (result.verified) {
            return NextResponse.json(
              {
                error: 'email_already_registered',
                message: 'This email is already registered. Please sign in or use a different email.',
              },
              { status: 409 }
            );
          }
        }

        userId = result.userId!;
      } else {
        // Some other database error
        throw error;
      }
    }

    // Create default project and workspace for new user
    try {
      const defaultProject = await createDefaultProject(userId);
      log.info('Created default project for new user', {
        email: data.email,
        projectUuid: defaultProject.uuid,
        userId,
      });
    } catch (error) {
      log.error('Failed to create default project for new user', error instanceof Error ? error : undefined, {
        email: data.email,
        userId,
      });
      // Don't fail the registration if project creation fails
    }

    // Send admin notification using the new centralized service
    await notifyAdminsOfNewUser({
      name: data.name,
      email: data.email,
      id: userId,
      source: 'email',
    });

    // Send welcome email to the user and schedule follow-ups
    // Note: We schedule follow-ups regardless of welcome email success
    // to ensure users always get the follow-up emails
    try {
      const welcomeEmailSent = await sendWelcomeEmail({
        name: data.name,
        email: data.email,
        signupSource: 'email',
        userId,
      });

      if (!welcomeEmailSent) {
        console.warn(`Welcome email failed to send for user ${userId} (${data.email})`);
      }
    } catch (error) {
      console.error(`Error sending welcome email for user ${userId}:`, error);
      // Don't fail registration if welcome email fails
    }
    
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
