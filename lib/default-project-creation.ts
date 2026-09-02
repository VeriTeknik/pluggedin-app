import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { profilesTable, projectsTable, users } from '@/db/schema';

import { addSampleMcpServersForNewUser } from './sample-mcp-servers';

/**
 * Creates a default project and workspace for a new user, once.
 *
 * The only place that creates a 'Default Hub'. It used to be three — this
 * helper, the verify-email route and getProjects — and the one guard among
 * them was a check-then-create that two concurrent requests both pass. In
 * production that left 27 users with a duplicate pair, created 0.0-0.1 seconds
 * apart, all of them OAuth sign-ups where a fresh session fires several
 * requests at once.
 *
 * The lock is on the user row, which is what the two callers have in common;
 * checking for an existing project without it does not help, because both
 * transactions read before either writes. app/api/auth/register/route.ts
 * already uses the same pattern against the same class of race.
 *
 * Callers:
 * - OAuth sign-in flow (lib/auth.ts)
 * - Email registration flow (app/api/auth/register/route.ts)
 * - Email verification (app/api/auth/verify-email/route.ts)
 * - First page load with no project (app/actions/projects.ts)
 *
 * @param userId - The user ID to create the project for
 * @returns The user's default project, existing or newly created
 */
export async function createDefaultProject(userId: string) {
  const result = await db.transaction(async (tx) => {
    // Serialise concurrent callers for this user before looking.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');

    const [existing] = await tx
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.user_id, userId))
      .limit(1);

    if (existing) {
      return { project: existing, profileUuid: null as string | null };
    }

    // Create the project
    const [project] = await tx
      .insert(projectsTable)
      .values({
        name: 'Default Hub',
        user_id: userId,
        active_profile_uuid: null, // Will be updated after creating profile
      })
      .returning();

    // Create the default workspace/profile
    const [profile] = await tx
      .insert(profilesTable)
      .values({
        name: 'Default Workspace',
        project_uuid: project.uuid,
      })
      .returning();

    // Update project with the active profile UUID
    const [updatedProject] = await tx
      .update(projectsTable)
      .set({ active_profile_uuid: profile.uuid })
      .where(eq(projectsTable.uuid, project.uuid))
      .returning();

    return {
      project: updatedProject,
      profileUuid: profile.uuid
    };
  });

  // Add sample MCP servers for the new user (outside transaction)
  // This allows the project creation to succeed even if server addition fails.
  // Skipped when the project already existed — the samples were added the first
  // time, and adding them again is what a second call used to do.
  try {
    if (result.profileUuid) {
      await addSampleMcpServersForNewUser(result.profileUuid);
    }
  } catch (error) {
    console.error('Failed to add sample MCP servers for new user:', error);
    // Don't fail the project creation if sample servers can't be added
  }

  return result.project;
}
