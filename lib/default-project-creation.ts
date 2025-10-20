import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { profilesTable, projectsTable } from '@/db/schema';
import { addSampleMcpServersForNewUser } from './sample-mcp-servers';

/**
 * Creates a default project and workspace for a new user
 *
 * This is used in both:
 * - OAuth sign-in flow (lib/auth.ts)
 * - Email registration flow (app/api/auth/register/route.ts)
 *
 * @param userId - The user ID to create the project for
 * @returns The created project with active profile UUID
 */
export async function createDefaultProject(userId: string) {
  const result = await db.transaction(async (tx) => {
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
  // This allows the project creation to succeed even if server addition fails
  try {
    await addSampleMcpServersForNewUser(result.profileUuid);
  } catch (error) {
    console.error('Failed to add sample MCP servers for new user:', error);
    // Don't fail the project creation if sample servers can't be added
  }

  return result.project;
}
