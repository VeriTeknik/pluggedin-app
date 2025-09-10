'use server';

import { cookies } from 'next/headers';
import { db } from '@/db';
import { accounts } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

export interface LastUsedSSO {
  provider: string;
  lastUsed: Date;
}

/**
 * Get the last used SSO provider based on email stored in cookie
 */
export async function getLastUsedSSO(): Promise<LastUsedSSO | null> {
  try {
    // Try to get the last login email from cookies
    const cookieStore = cookies();
    const lastEmail = cookieStore.get('last-login-email')?.value;
    
    if (!lastEmail) {
      return null;
    }
    
    // Find user by email
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, lastEmail),
    });
    
    if (!user) {
      return null;
    }
    
    // Get the most recently used account for this user
    const lastUsedAccount = await db.query.accounts.findFirst({
      where: eq(accounts.userId, user.id),
      orderBy: desc(accounts.last_used),
      columns: {
        provider: true,
        last_used: true,
      },
    });
    
    if (!lastUsedAccount || !lastUsedAccount.last_used) {
      return null;
    }
    
    return {
      provider: lastUsedAccount.provider,
      lastUsed: lastUsedAccount.last_used,
    };
  } catch (error) {
    console.error('Error fetching last used SSO:', error);
    return null;
  }
}