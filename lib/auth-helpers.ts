'use server';

import { eq } from 'drizzle-orm';
import { Session } from 'next-auth';

import { db } from '@/db';
import { projectsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

type AuthenticatedFunction<T> = (session: Session & { user: { id: string } }) => Promise<T>;

/**
 * Higher-order function that wraps server actions requiring authentication
 * @param fn Function that requires an authenticated session
 * @returns The result of the function or throws an auth error
 */
export async function withAuth<T>(fn: AuthenticatedFunction<T>): Promise<T> {
  const session = await getAuthSession();
  
  if (!session?.user?.id) {
    throw new Error('Unauthorized - you must be logged in to perform this action');
  }

  return fn(session as Session & { user: { id: string } });
}

type ProjectAuthenticatedFunction<T> = (
  session: Session & { user: { id: string } },
  project: { uuid: string; user_id: string }
) => Promise<T>;

/**
 * Higher-order function that wraps server actions requiring project ownership verification
 * @param projectUuid UUID of the project to verify
 * @param fn Function that requires project ownership verification
 * @returns The result of the function or throws an auth/access error
 */
export async function withProjectAuth<T>(
  projectUuid: string,
  fn: ProjectAuthenticatedFunction<T>
): Promise<T> {
  return withAuth(async (session) => {
    const project = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.uuid, projectUuid))
      .limit(1);

    if (project.length === 0) {
      throw new Error('Project not found');
    }

    if (project[0].user_id !== session.user.id) {
      throw new Error('Unauthorized - you do not have access to this project');
    }

    return fn(session, project[0]);
  });
} 