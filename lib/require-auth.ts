import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';

/**
 * Resolve the authenticated user's ID from the server session.
 * For use in server actions that need session-based auth.
 * Throws if not authenticated.
 */
export async function requireAuthUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error('Authentication required');
  }
  return session.user.id;
}
