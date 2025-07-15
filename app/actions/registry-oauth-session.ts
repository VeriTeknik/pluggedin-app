'use server';

import { createHash, randomBytes } from 'crypto';
import { and, eq, gt } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';

import { db } from '@/db';
import { registryOAuthSessions } from '@/db/schema';
import { authOptions } from '@/lib/auth';

// Session duration: 24 hours
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

// Cookie configuration
const COOKIE_NAME = 'registry_session';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: SESSION_DURATION_MS / 1000, // Convert to seconds
  path: '/',
};

/**
 * Generate a secure session token
 */
function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hash the session token for database storage
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Store OAuth token securely on the server and return a session token
 */
export async function storeRegistryOAuthToken(oauthToken: string, githubUsername: string) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated' };
    }

    // Generate session token
    const sessionToken = generateSessionToken();
    const hashedToken = hashToken(sessionToken);

    // Store in database
    await db.insert(registryOAuthSessions).values({
      userId: session.user.id,
      sessionTokenHash: hashedToken,
      oauthToken, // In production, consider encrypting this
      githubUsername,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
    });

    // Set secure httpOnly cookie
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, sessionToken, COOKIE_OPTIONS);

    return { success: true, sessionToken };
  } catch (error) {
    console.error('Error storing OAuth token:', error);
    return { success: false, error: 'Failed to store OAuth token' };
  }
}

/**
 * Retrieve OAuth token from secure session
 */
export async function getRegistryOAuthToken() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get session token from cookie
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(COOKIE_NAME)?.value;
    
    if (!sessionToken) {
      return { success: false, error: 'No session found' };
    }

    const hashedToken = hashToken(sessionToken);

    // Retrieve from database
    const [oauthSession] = await db
      .select()
      .from(registryOAuthSessions)
      .where(
        and(
          eq(registryOAuthSessions.userId, session.user.id),
          eq(registryOAuthSessions.sessionTokenHash, hashedToken),
          gt(registryOAuthSessions.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!oauthSession) {
      return { success: false, error: 'Session expired or not found' };
    }

    return {
      success: true,
      oauthToken: oauthSession.oauthToken,
      githubUsername: oauthSession.githubUsername,
    };
  } catch (error) {
    console.error('Error retrieving OAuth token:', error);
    return { success: false, error: 'Failed to retrieve OAuth token' };
  }
}

/**
 * Clear OAuth session
 */
export async function clearRegistryOAuthSession() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get session token from cookie
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(COOKIE_NAME)?.value;
    
    if (sessionToken) {
      const hashedToken = hashToken(sessionToken);
      
      // Delete from database
      await db
        .delete(registryOAuthSessions)
        .where(
          and(
            eq(registryOAuthSessions.userId, session.user.id),
            eq(registryOAuthSessions.sessionTokenHash, hashedToken)
          )
        );
    }

    // Clear cookie
    cookieStore.delete(COOKIE_NAME);

    return { success: true };
  } catch (error) {
    console.error('Error clearing OAuth session:', error);
    return { success: false, error: 'Failed to clear session' };
  }
}

/**
 * Check if user has a valid OAuth session
 */
export async function hasValidRegistryOAuthSession() {
  const result = await getRegistryOAuthToken();
  return result.success;
}

/**
 * Clean up expired sessions (can be run periodically)
 */
export async function cleanupExpiredSessions() {
  try {
    await db
      .delete(registryOAuthSessions)
      .where(gt(registryOAuthSessions.expiresAt, new Date()));
    
    return { success: true };
  } catch (error) {
    console.error('Error cleaning up expired sessions:', error);
    return { success: false, error: 'Failed to cleanup sessions' };
  }
}