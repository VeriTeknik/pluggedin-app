'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db';
import { accounts, users, userEmailPreferencesTable } from '@/db/schema';

export interface ConnectedAccount {
  provider: string;
  lastUsed: Date | null;
}

/**
 * Get all connected accounts for a user with last used information
 * This function fetches the OAuth provider accounts associated with a user
 */
export async function getConnectedAccounts(userId: string): Promise<ConnectedAccount[]> {
  try {
    const userAccounts = await db.query.accounts.findMany({
      where: eq(accounts.userId, userId),
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
 */
export const removeConnectedAccount = async (userId: string, provider: string) => {
  try {
    // Find the user to verify they exist
    const userExists = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    
    if (!userExists) {
      return { success: false, error: 'User not found' };
    }
    
    // Get all user's accounts to ensure we're not removing the only login method
    const userAccounts = await db.query.accounts.findMany({
      where: eq(accounts.userId, userId),
    });
    
    // Don't allow removing the only login method
    // Users should always have at least one way to login
    if (userAccounts.length <= 1) {
      return { 
        success: false, 
        error: 'Cannot remove the only login method. Please connect another account first.' 
      };
    }
    
    // Delete the account connection
    await db.delete(accounts).where(
      and(
        eq(accounts.userId, userId),
        eq(accounts.provider, provider)
      )
    );
    
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
