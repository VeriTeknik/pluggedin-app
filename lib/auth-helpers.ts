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