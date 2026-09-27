'use server';

import { hash } from 'bcrypt';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { db } from '@/db';
import { accounts, userEmailPreferencesTable, users } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';
import { isPasswordComplex, recordPasswordChange } from '@/lib/auth-security';
import {
  hasRecentOAuthSignIn,
  hasRecentReauthentication,
  verifyCurrentPassword,
} from '@/lib/credential-reverification';
import { generatePasswordRemovedEmail,generatePasswordSetEmail, sendEmail } from '@/lib/email';
import log from '@/lib/logger';

/**
 * Bcrypt Cost Factor Configuration
 * Consistent with registration and password change operations
 */
const BCRYPT_COST_FACTOR = 14;

/** Server actions have no request object; audit entries say where they came from. */
const SERVER_ACTION_CLIENT = { ipAddress: 'server-action', userAgent: 'server-action' };

function tooManyAttempts() {
  return {
    success: false as const,
    code: 'RATE_LIMITED' as const,
    error: 'Too many attempts. Please try again later.',
  };
}

const removePasswordSchema = z.object({
  confirmEmail: z.string().min(1),
  currentPassword: z.string().min(1, 'Current password is required'),
});

const emailPreferencesSchema = z
  .object({
    welcomeEmails: z.boolean().optional(),
    productUpdates: z.boolean().optional(),
    marketingEmails: z.boolean().optional(),
    adminNotifications: z.boolean().optional(),
  })
  .strict();

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

const removeConnectedAccountSchema = z.object({
  provider: z.string().min(1).max(64),
  currentPassword: z.string().min(1).max(1024).optional(),
});

type RemoveConnectedAccountResult =
  | { success: true; error?: undefined; code?: undefined }
  | {
      success: false;
      error: string;
      code?:
        | 'NOT_CONNECTED'
        | 'LAST_LOGIN_METHOD'
        | 'PASSWORD_REQUIRED'
        | 'INCORRECT_PASSWORD'
        | 'REAUTH_REQUIRED'
        | 'RATE_LIMITED';
    };

/**
 * Remove a connected account for a user
 * This function removes the connection to a specific OAuth provider
 * SECURITY: User is derived from session, not client input. Unlinking a
 * sign-in method is a credential change, so the session alone is not enough:
 * - an account with a password re-enters it (throttled, counted toward the
 *   login lockout);
 * - an OAuth-only account needs THIS session to have signed in within the
 *   re-auth window through a DIFFERENT provider that stays linked — a stolen
 *   session cannot do that, and the provider being removed cannot vouch for
 *   its own removal.
 * The last way to sign in is never removed.
 */
export async function removeConnectedAccount(
  provider: string,
  reverification: { currentPassword?: string } = {}
): Promise<RemoveConnectedAccountResult> {
  try {
    // SECURITY: Get authenticated user from session
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized - please log in again' };
    }

    const parsed = removeConnectedAccountSchema.safeParse({ provider, ...reverification });
    if (!parsed.success) {
      return { success: false, error: 'Invalid request' };
    }
    const { currentPassword } = parsed.data;

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

    // The delete below removes every row of this provider, so count what is
    // left by provider, not by row.
    const hasPassword = !!user.password;
    const remaining = user.accounts.filter((a) => a.provider !== parsed.data.provider);
    if (remaining.length === user.accounts.length) {
      return { success: false, code: 'NOT_CONNECTED', error: 'This account is not connected' };
    }

    // CRITICAL: Don't allow removing the only login method
    if (!hasPassword && remaining.length === 0) {
      return {
        success: false,
        code: 'LAST_LOGIN_METHOD',
        error: 'Cannot remove the only login method. Please add a password or connect another account first.'
      };
    }

    // SECURITY: Re-verify before removing a sign-in method
    if (hasPassword) {
      if (!currentPassword) {
        return {
          success: false,
          code: 'PASSWORD_REQUIRED',
          error: 'Enter your current password to disconnect this account.',
        };
      }
      const reverified = await verifyCurrentPassword(user, currentPassword, SERVER_ACTION_CLIENT);
      if (!reverified.ok) {
        if (reverified.reason === 'throttled') return tooManyAttempts();
        log.warn('Account disconnect attempted with incorrect current password', {
          userId: user.id,
          provider: parsed.data.provider,
        });
        return { success: false, code: 'INCORRECT_PASSWORD', error: 'Current password is incorrect' };
      }
    } else if (
      !hasRecentReauthentication(session, {
        linkedProviders: remaining.map((a) => a.provider),
        hasPassword: false,
        passwordChangedAt: user.password_changed_at,
      })
    ) {
      return {
        success: false,
        code: 'REAUTH_REQUIRED',
        error: 'For your security, sign in again with another connected account, then disconnect this one.',
      };
    }

    // Delete the account connection
    await db.delete(accounts).where(
      and(
        eq(accounts.userId, session.user.id),
        eq(accounts.provider, parsed.data.provider)
      )
    );

    // Log the security event
    log.info('OAuth account disconnected', {
      userId: session.user.id,
      provider: parsed.data.provider,
      remainingAccounts: remaining.map((a) => a.provider),
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
 * Get the signed-in user's email preferences
 * SECURITY: User is derived from session, not client input
 */
export async function getUserEmailPreferences() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return null;
    }

    const preferences = await db.query.userEmailPreferencesTable.findFirst({
      where: eq(userEmailPreferencesTable.userId, session.user.id),
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
 * Update the signed-in user's email preferences
 * SECURITY: User is derived from session, not client input, and only the
 * preference flags are writable.
 */
export async function updateEmailPreferences(
  input: z.infer<typeof emailPreferencesSchema>
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized - please log in again' };
    }
    const userId = session.user.id;

    const parsed = emailPreferencesSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: 'Invalid email preferences' };
    }
    const preferences = parsed.data;

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
 * SECURITY: User is derived from session, not client input. The session alone
 * is not enough: the current password must be re-entered, otherwise a stolen
 * session could clear it and install a new one via setPassword.
 */
export async function removePassword(input: { confirmEmail: string; currentPassword: string }) {
  try {
    // SECURITY: Get authenticated user from session
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized - please log in again' };
    }

    const parsed = removePasswordSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
    }
    const { confirmEmail, currentPassword } = parsed.data;

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

    // SECURITY: Re-verify the credential being removed (throttled per user and
    // counted toward the login lockout, see lib/credential-reverification)
    const reverified = await verifyCurrentPassword(user, currentPassword, SERVER_ACTION_CLIENT);
    if (!reverified.ok) {
      if (reverified.reason === 'throttled') return tooManyAttempts();
      log.warn('Password removal attempted with incorrect current password', { userId: user.id });
      return {
        success: false,
        error: 'Current password is incorrect',
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
 * SECURITY: User is derived from session, not client input. Adding a
 * credential requires a fresh sign-in with a linked provider, so a stolen
 * session cannot mint a permanent password login.
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
      with: {
        accounts: true,
      },
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

    // SECURITY: Require that this session signed in recently through a linked provider
    if (!hasRecentOAuthSignIn(session, user.accounts ?? [])) {
      return {
        success: false,
        code: 'REAUTH_REQUIRED' as const,
        error: 'For your security, sign in again with a connected account, then set your password.',
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
