import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { projectsTable, profilesTable } from '@/db/schema';

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
  return await db.transaction(async (tx) => {
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

    return updatedProject;
  });
}
