/**
 * Server Utilities
 *
 * Centralized helpers for session management, user fetching, and error handling
 * in server actions to reduce boilerplate and improve consistency
 */

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { users } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';
import log from '@/lib/logger';

/**
 * Requires an authenticated session and returns the user ID
 *
 * @throws {Error} If no valid session exists
 * @returns The authenticated user's ID
 */
export async function requireSessionUserId(): Promise<string> {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    throw new Error('Unauthorized - please log in again');
  }

  return session.user.id;
}

/**
 * Fetches a user by ID with optional related data
 *
 * @param userId - The user ID to fetch
 * @param options - Optional configuration for related data
 * @throws {Error} If user not found
 * @returns The user object with optional related data
 */
export async function requireUser(
  userId: string,
  options?: { withAccounts?: boolean }
) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    with: options?.withAccounts ? { accounts: true } : undefined,
  });

  if (!user) {
    throw new Error('User not found');
  }

  return user;
}

/**
 * Wraps a server action function with standardized error handling
 *
 * @param fn - The async function to wrap
 * @returns Object with success flag and either result or error message
 */
export async function wrapServerAction<T>(
  fn: () => Promise<T>
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error: any) {
    // Log the error for debugging
    log.error('Server action error', error instanceof Error ? error : undefined, {
      message: error.message || 'Unknown error',
      stack: error.stack,
    });

    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    };
  }
}

/**
 * Validates that an email matches the user's email
 *
 * @param userEmail - The user's actual email
 * @param confirmEmail - The email provided for confirmation
 * @param userId - User ID for logging purposes
 * @throws {Error} If emails don't match
 */
export async function requireEmailMatch(
  userEmail: string,
  confirmEmail: string,
  userId: string
): Promise<void> {
  if (userEmail !== confirmEmail) {
    log.warn('Email confirmation mismatch', {
      userId,
      provided: confirmEmail,
    });
    throw new Error('Email confirmation does not match your account email');
  }
}

/**
 * Validates that a user has at least one alternative login method
 *
 * @param hasPassword - Whether user has a password set
 * @param accountCount - Number of OAuth accounts connected
 * @throws {Error} If no alternative login methods exist
 */
export function requireAlternativeLoginMethod(
  hasPassword: boolean,
  accountCount: number
): void {
  if (!hasPassword && accountCount === 0) {
    throw new Error(
      'Cannot remove the only login method. Add a password or connect another account first.'
    );
  }
}

/**
 * Type guard to check if an error has a status property
 */
export function isHttpError(error: unknown): error is { status: number; message: string; code?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as any).status === 'number'
  );
}
