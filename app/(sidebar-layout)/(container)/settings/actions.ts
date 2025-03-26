'use server';

import { db } from '@/db';
import { accounts } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function getConnectedAccounts(userId: string) {
  const userAccounts = await db
    .select({
      provider: accounts.provider,
    })
    .from(accounts)
    .where(eq(accounts.userId, userId));

  return userAccounts.map(account => account.provider);
}
