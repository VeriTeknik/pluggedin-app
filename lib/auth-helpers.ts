'use server';

import { eq } from 'drizzle-orm';
import { Session } from 'next-auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect-error';

import { db } from '@/db';
import { projectsTable, users } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

type AuthenticatedFunction<T> = (session: Session & { user: { id: string } }) => Promise<T>;

/**
 * Clear session cookies and redirect to login page
 */
async function clearSessionAndRedirect(): Promise<never> {
  const cookieStore = await cookies();

  // Delete NextAuth session cookies
  cookieStore.delete('next-auth.session-token');
  cookieStore.delete('__Secure-next-auth.session-token');

  redirect('/login');
}

/**
 * Higher-order function that wraps server actions requiring authentication
 * @param fn Function that requires an authenticated session
 * @returns The result of the function or throws an auth error
 */
export async function withAuth<T>(fn: AuthenticatedFunction<T>): Promise<T> {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    // Session invalid or doesn't exist - likely environment switch
    // Clear session cookie and redirect to login
    await clearSessionAndRedirect();
  }

  // Type assertion: session.user.id is guaranteed to exist at this point
  // because clearSessionAndRedirect() above never returns (throws via redirect)
  const authenticatedSession = session as Session & { user: { id: string } };

  // Extra hardening: ensure the user referenced by the session still exists in DB
  try {
    const existingUser = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, authenticatedSession.user.id),
      columns: { id: true },
    });

    if (!existingUser) {
      // User doesn't exist - likely switching between local/docker environments
      console.warn(`Invalid session detected for user ${authenticatedSession.user.id}, clearing session`);
      await clearSessionAndRedirect();
    }
  } catch (dbError) {
    // If the error is from redirect, let it propagate
    if (isRedirectError(dbError)) {
      throw dbError; // This is Next.js redirect error, don't catch it
    }
    // Otherwise, log and throw a DB error
    console.error('Database error checking user:', dbError);
    throw new Error('Database error - please try again later');
  }

  return fn(authenticatedSession);
}

/**
 * Higher-order function that verifies workspace UI is enabled for the current user
 * @returns The authenticated session or throws an auth error
 */
export async function requireWorkspaceUI(): Promise<Session & { user: { id: string } }> {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    throw new Error('Unauthorized - you must be logged in to perform this action');
  }

  // Check if workspace UI is enabled for this user
  const [user] = await db
    .select({ show_workspace_ui: users.show_workspace_ui })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user?.show_workspace_ui) {
    throw new Error('Workspace management is not enabled for this account');
  }

  return session as Session & { user: { id: string } };
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

type ProfileAuthenticatedFunction<T> = (
  session: Session & { user: { id: string } },
  profile: { uuid: string; project_uuid: string }
) => Promise<T>;

/**
 * Higher-order function that wraps server actions requiring profile ownership verification
 * @param profileUuid UUID of the profile to verify
 * @param fn Function that requires profile ownership verification
 * @returns The result of the function or throws an auth/access error
 */
export async function withProfileAuth<T>(
  profileUuid: string,
  fn: ProfileAuthenticatedFunction<T>
): Promise<T> {
  return withAuth(async (session) => {
    const { profilesTable } = await import('@/db/schema');
    
    const profile = await db
      .select({
        profile: profilesTable,
        project: projectsTable,
      })
      .from(profilesTable)
      .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
      .where(eq(profilesTable.uuid, profileUuid))
      .limit(1);

    if (profile.length === 0) {
      throw new Error('Profile not found');
    }

    if (profile[0].project.user_id !== session.user.id) {
      throw new Error('Unauthorized - you do not have access to this profile');
    }

    return fn(session, profile[0].profile);
  });
}

type ServerAuthenticatedFunction<T> = (
  session: Session & { user: { id: string } },
  server: { uuid: string; profile_uuid: string }
) => Promise<T>;

/**
 * Higher-order function that wraps server actions requiring MCP server ownership verification
 * @param serverUuid UUID of the MCP server to verify
 * @param fn Function that requires server ownership verification
 * @returns The result of the function or throws an auth/access error
 */
export async function withServerAuth<T>(
  serverUuid: string,
  fn: ServerAuthenticatedFunction<T>
): Promise<T> {
  return withAuth(async (session) => {
    const { mcpServersTable, profilesTable } = await import('@/db/schema');
    
    const server = await db
      .select({
        server: mcpServersTable,
        profile: profilesTable,
        project: projectsTable,
      })
      .from(mcpServersTable)
      .innerJoin(profilesTable, eq(mcpServersTable.profile_uuid, profilesTable.uuid))
      .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
      .where(eq(mcpServersTable.uuid, serverUuid))
      .limit(1);

    if (server.length === 0) {
      throw new Error('Server not found');
    }

    if (server[0].project.user_id !== session.user.id) {
      throw new Error('Unauthorized - you do not have access to this server');
    }

    return fn(session, server[0].server);
  });
}

/**
 * Standard error response type for consistent error handling
 */
export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Wrapper for server actions that returns a standardized response
 * @param fn Async function to execute
 * @returns Standardized response object
 */
export async function withActionResponse<T>(
  fn: () => Promise<T>
): Promise<ActionResponse<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    console.error('Action error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred',
    };
  }
} 