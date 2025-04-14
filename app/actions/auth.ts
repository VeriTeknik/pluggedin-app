'use server';

import { eq } from 'drizzle-orm';
import { getServerSession } from 'next-auth';

import { db } from '@/db';
import { sessions, users, verificationTokens } from '@/db/schema';
import { authOptions } from '@/lib/auth';

/**
 * Server action to handle logout by directly removing the session from the database
 */
export async function serverLogout() {
  try {
    // Get the current session
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    
    if (email) {
      // Find the user ID from email
      const user = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.email, email),
      });
      
      if (user?.id) {
        // Delete all sessions for this user
        await db.delete(sessions).where(eq(sessions.userId, user.id));
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Server logout error:', error);
    return { success: false, error: 'Failed to logout' };
  }
}

export async function verifyEmail(token: string) {
  try {
    // Find the verification token
    const verificationToken = await db.query.verificationTokens.findFirst({
      where: eq(verificationTokens.token, token),
    });

    if (!verificationToken) {
      throw new Error('Invalid or expired verification token');
    }

    // Update user's emailVerified field
    await db.update(users)
      .set({ 
        emailVerified: new Date(),
        updated_at: new Date()
      })
      .where(eq(users.email, verificationToken.identifier));

    // Delete the used token
    await db.delete(verificationTokens)
      .where(eq(verificationTokens.token, token));

    return { success: true };
  } catch (error) {
    console.error('Error verifying email:', error);
    throw error;
  }
} 