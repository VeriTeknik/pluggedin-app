import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { users, verificationTokens } from '@/db/schema';
import { createDefaultProject } from '@/lib/default-project-creation';

const verifyEmailSchema = z.object({
  token: z.string(),
});

/**
 * @swagger
 * /api/auth/verify-email:
 *   post:
 *     summary: Verify user email address
 *     description: Verifies a user's email address using a verification token received via email. It updates the user's status, deletes the token, and attempts to create a default project/profile.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: The email verification token received via email.
 *     responses:
 *       200:
 *         description: Email verified successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Email verified successfully
 *       400:
 *         description: Bad Request - Invalid input data or token is invalid/expired.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Invalid verification data | Invalid or expired verification token | Verification token has expired
 *                 errors:
 *                   type: array # Zod error details (only for invalid input)
 *                   items:
 *                     type: object
 *                   nullable: true
 *       404:
 *         description: Not Found - User associated with the token was not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User not found
 *       500:
 *         description: Internal Server Error - Failed to verify email or create default project.
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
  try {
    const body = await req.json();
    const data = verifyEmailSchema.parse(body);

    // Find the verification token
    const verificationToken = await db.query.verificationTokens.findFirst({
      where: (tokens, { eq }) => eq(tokens.token, data.token),
    });

    if (!verificationToken) {
      return NextResponse.json(
        { message: 'Invalid or expired verification token' },
        { status: 400 }
      );
    }

    // Check if the token has expired
    if (new Date() > new Date(verificationToken.expires)) {
      return NextResponse.json(
        { message: 'Verification token has expired' },
        { status: 400 }
      );
    }

    // A row with no user_id belongs to NextAuth's email provider, which
    // consumes it through its own callback. This route may not verify one:
    // resolving by the address is what let a token issued for one user verify
    // whichever row happened to hold that email.
    if (!verificationToken.user_id) {
      return NextResponse.json(
        { message: 'Invalid or expired verification token' },
        { status: 400 }
      );
    }

    // Find the user this token was issued for — not whoever holds the address
    const boundUserId = verificationToken.user_id;
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, boundUserId),
    });

    if (!user) {
      return NextResponse.json(
        { message: 'User not found' },
        { status: 404 }
      );
    }

    // Update the user's emailVerified status
    await db
      .update(users)
      .set({
        emailVerified: new Date(),
        updated_at: new Date(),
      })
      .where(eq(users.id, user.id));

    // Delete the verification token
    await db
      .delete(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, verificationToken.identifier),
          eq(verificationTokens.token, verificationToken.token)
        )
      );

    // Create a default project for the newly verified user.
    //
    // Delegated rather than inlined: createDefaultProject locks the user row
    // and returns any existing project, so a user who already has one from
    // registration or a first page load does not get a second.
    try {
      await createDefaultProject(user.id);
    } catch (projectError) {
      console.error('Error creating default project:', projectError);
      // We won't fail the verification process if project creation fails
      // The project will be created when the user logs in
    }

    return NextResponse.json(
      { message: 'Email verified successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Email verification error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid verification data', errors: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { message: 'Something went wrong' },
      { status: 500 }
    );
  }
}
