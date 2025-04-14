'use server';

import { sql } from 'drizzle-orm';

import { db } from '@/db';
import { users } from '@/db/schema';

import { isFollowingUser } from './social';

export async function searchUsers(username: string) {
  if (!username.trim()) return [];
  
  try {
    const results = await db
      .select()
      .from(users)
      .where(sql`LOWER(username) LIKE LOWER(${`%${username}%`})`);

    const followingStatuses = await Promise.all(
      results.map(user => isFollowingUser(user.id, user.id))
    );

    return results.map((user, i) => ({
      user,
      isFollowing: followingStatuses[i]
    }));
  } catch (error) {
    console.error('Error searching users:', error);
    throw new Error('Failed to search for users');
  }
} 