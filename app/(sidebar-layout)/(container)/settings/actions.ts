'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db';
import { accounts, users } from '@/db/schema';

/**
 * Get all connected accounts for a user
 * This function fetches the OAuth provider accounts associated with a user
 */
export async function getConnectedAccounts(userId: string): Promise<string[]> {
  try {
    const userAccounts = await db.query.accounts.findMany({
      where: eq(accounts.userId, userId),
    });
    
    // Return an array of provider names
    return userAccounts.map(account => account.provider);
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
    console.error(`Error removing ${provider} account:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
