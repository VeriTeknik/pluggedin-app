'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { hash } from 'bcrypt';

import { db } from '@/db';
import { accounts, userEmailPreferencesTable, users } from '@/db/schema';
import { isPasswordComplex, recordPasswordChange } from '@/lib/auth-security';
import { getAuthSession } from '@/lib/auth';
import log from '@/lib/logger';
import { sendEmail, generatePasswordSetEmail, generatePasswordRemovedEmail } from '@/lib/email';

/**
 * Bcrypt Cost Factor Configuration
 * Consistent with registration and password change operations
 */
const BCRYPT_COST_FACTOR = 14;

export interface ConnectedAccount {
  provider: string;
  lastUsed: Date | null;
}

/**
 * Get all connected accounts for a user with last used information
 * This function fetches the OAuth provider accounts associated with a user
 * SECURITY: User is derived from session, not client input
 */
export async function getConnectedAccounts(): Promise<ConnectedAccount[]> {
  try {
    // SECURITY: Get authenticated user from session
    const session = await getAuthSession();
    if (!session?.user?.id) {
      console.warn('getConnectedAccounts called without valid session');
      return [];
    }

    const userAccounts = await db.query.accounts.findMany({
      where: eq(accounts.userId, session.user.id),
      columns: {
        provider: true,
        last_used: true,
      },
    });

    // Return an array of provider info with last used dates
    return userAccounts.map(account => ({
      provider: account.provider,
      lastUsed: account.last_used,
    }));
  } catch (error) {
    console.error('Error fetching connected accounts:', error);
    return [];
  }
}

/**
 * Remove a connected account for a user
 * This function removes the connection to a specific OAuth provider
 * SECURITY: User is derived from session, not client input
 */
export const removeConnectedAccount = async (provider: string) => {
  try {
    // SECURITY: Get authenticated user from session
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized - please log in again' };
    }

    // Find the user to verify they exist and get their password status
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      with: {
        accounts: true,
      },
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // CRITICAL: Check if user has at least one other login method
    // Don't allow removing the only login method
    const hasPassword = !!user.password;
    const oauthAccountCount = user.accounts.length;

    // User must have either:
    // - A password AND at least 1 OAuth account remaining, OR
    // - At least 2 OAuth accounts (can remove 1, keep 1)
    if (!hasPassword && oauthAccountCount <= 1) {
      return {
        success: false,
        error: 'Cannot remove the only login method. Please add a password or connect another account first.'
      };
    }

    // Delete the account connection
    await db.delete(accounts).where(
      and(
        eq(accounts.userId, session.user.id),
        eq(accounts.provider, provider)
      )
    );

    // Log the security event
    log.info('OAuth account disconnected', {
      userId: session.user.id,
      provider,
      remainingAccounts: user.accounts.filter((a) => a.provider !== provider).map((a) => a.provider),
      hasPassword,
    });

    // Revalidate the settings page to reflect the changes
    revalidatePath('/settings');

    return { success: true };
  } catch (error) {
    console.error('Error removing account:', { provider, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get user's email preferences
 */
export async function getUserEmailPreferences(userId: string) {
  try {
    const preferences = await db.query.userEmailPreferencesTable.findFirst({
      where: eq(userEmailPreferencesTable.userId, userId),
    });

    // Return defaults if no preferences exist
    return preferences || {
      welcomeEmails: true,
      productUpdates: true,
      marketingEmails: false,
      adminNotifications: true,
      notificationSeverity: 'ALERT,CRITICAL',
    };
  } catch (error) {
    console.error('Error fetching email preferences:', error);
    return null;
  }
}

/**
 * Update user's email preferences
 */
export async function updateEmailPreferences(
  userId: string,
  preferences: {
    welcomeEmails?: boolean;
    productUpdates?: boolean;
    marketingEmails?: boolean;
    adminNotifications?: boolean;
  }
) {
  try {
    // Check if preferences exist
    const existing = await db.query.userEmailPreferencesTable.findFirst({
      where: eq(userEmailPreferencesTable.userId, userId),
    });

    if (existing) {
      // Update existing preferences
      await db
        .update(userEmailPreferencesTable)
        .set({
          ...preferences,
          updatedAt: new Date(),
        })
        .where(eq(userEmailPreferencesTable.userId, userId));
    } else {
      // Create new preferences
      await db.insert(userEmailPreferencesTable).values({
        userId,
        ...preferences,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    console.error('Error updating email preferences:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Remove password from user account
 * Requires at least one OAuth account to be connected
 * SECURITY: User is derived from session, not client input
 */
export async function removePassword(confirmEmail: string) {
  try {
    // SECURITY: Get authenticated user from session
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized - please log in again' };
    }

    // Get user with accounts to check login methods
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      with: {
        accounts: true,
      },
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Verify email confirmation matches
    if (user.email !== confirmEmail) {
      log.warn('Password removal attempted with mismatched email', {
        userId: user.id,
        userEmail: user.email,
        confirmEmail,
      });
      return {
        success: false,
        error: 'Email confirmation does not match',
      };
    }

    // Check if user has a password
    if (!user.password) {
      return {
        success: false,
        error: 'No password is set for this account',
      };
    }

    // CRITICAL: Check if user has at least one OAuth account
    if (user.accounts.length === 0) {
      log.warn('Password removal blocked - no OAuth accounts', {
        userId: user.id,
        email: user.email,
      });
      return {
        success: false,
        error: 'Cannot remove password. It\'s your only login method. Please connect an OAuth account first.',
      };
    }

    // Remove the password and update password_changed_at
    await db
      .update(users)
      .set({
        password: null,
        password_changed_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(users.id, user.id));

    // Record password change for audit log
    const ipAddress = 'server-action'; // Server actions don't have direct IP access
    const userAgent = 'server-action';
    await recordPasswordChange(user.id, ipAddress, userAgent);

    // Send email notification (non-blocking - don't fail operation if email fails)
    const remainingLoginMethods = user.accounts.map((a) => a.provider);
    try {
      const emailData = generatePasswordRemovedEmail(
        user.email,
        ipAddress,
        userAgent,
        new Date(),
        remainingLoginMethods
      );
      await sendEmail(emailData);
    } catch (error) {
      // Log but don't fail the operation
      log.error('Failed to send password removed notification email', {
        userId: user.id,
        email: user.email,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Log the security event
    log.info('Password removed from account', {
      userId: user.id,
      email: user.email,
      remainingLoginMethods,
      accountCount: user.accounts.length,
    });

    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    console.error('Password removal error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove password',
    };
  }
}

/**
 * Set password for OAuth-only user
 * Allows users who registered with OAuth to add a password
 * SECURITY: User is derived from session, not client input
 */
export async function setPassword(newPassword: string) {
  try {
    // SECURITY: Get authenticated user from session
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized - please log in again' };
    }

    // Get user
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Check if user already has a password
    if (user.password) {
      return {
        success: false,
        error: 'Password already exists. Use the change password option instead.',
      };
    }

    // Validate password complexity
    const complexityCheck = isPasswordComplex(newPassword);
    if (!complexityCheck.isValid) {
      return {
        success: false,
        error: 'Password does not meet complexity requirements',
        details: complexityCheck.errors,
      };
    }

    // Hash the new password
    const hashedPassword = await hash(newPassword, BCRYPT_COST_FACTOR);

    // Update user with new password and password_changed_at
    await db
      .update(users)
      .set({
        password: hashedPassword,
        password_changed_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(users.id, user.id));

    // Record password change for audit log
    const ipAddress = 'server-action'; // Server actions don't have direct IP access
    const userAgent = 'server-action';
    await recordPasswordChange(user.id, ipAddress, userAgent);

    // Send email notification (non-blocking - don't fail operation if email fails)
    try {
      const emailData = generatePasswordSetEmail(
        user.email,
        ipAddress,
        userAgent,
        new Date()
      );
      await sendEmail(emailData);
    } catch (error) {
      // Log but don't fail the operation
      log.error('Failed to send password set notification email', {
        userId: user.id,
        email: user.email,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Log the security event
    log.info('Password set for OAuth user', {
      userId: user.id,
      email: user.email,
    });

    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    console.error('Password set error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set password',
    };
  }
}
