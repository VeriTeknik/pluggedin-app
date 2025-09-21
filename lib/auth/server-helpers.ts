import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';

/**
 * Require authenticated user ID from server session
 * @throws Error with "UNAUTHORIZED" message if not authenticated
 */
export async function requireUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error('UNAUTHORIZED');
  }
  return session.user.id;
}