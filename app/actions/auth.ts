'use server';

import { eq } from 'drizzle-orm';
import { getServerSession } from 'next-auth';

import { db } from '@/db';
import { sessions } from '@/db/schema';
import { authOptions } from '@/lib/auth';

/**
 * Server action to handle logout by directly removing the session from the database
 */
export async function serverLogout() {
  try {
    // Get the current session
    const session = await getServerSession(authOptions);
    
    if (session && session.user.email) {
      // Find the user ID from email
      const user = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.email, session.user.email),
      });
      
      if (user && user.id) {
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