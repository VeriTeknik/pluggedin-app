'use server';

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { profilesTable, projectsTable } from '@/db/schema';
import { withAuth, withProjectAuth } from '@/lib/auth-helpers';
import { createDefaultProject } from '@/lib/default-project-creation';

export async function createProject(name: string) {
  return withAuth(async (session) => {
    return await db.transaction(async (tx) => {
      // First create the project with a temporary self-referential UUID
      const [project] = await tx
        .insert(projectsTable)
        .values({
          name,
          active_profile_uuid: null,
          user_id: session.user.id,
        })
        .returning();

      // Create the profile with the actual project UUID
      const [profile] = await tx
        .insert(profilesTable)
        .values({
          name: 'Default Workspace',
          project_uuid: project.uuid,
        })
        .returning();

      // Update the project with the correct profile UUID
      const [updatedProject] = await tx
        .update(projectsTable)
        .set({ active_profile_uuid: profile.uuid })
        .where(eq(projectsTable.uuid, project.uuid))
        .returning();

      return updatedProject;
    });
  });
}

export async function getProject(projectUuid: string) {
  return withProjectAuth(projectUuid, async (_, project) => {
    return project;
  });
}

export async function getProjects() {
  return withAuth(async (session) => {
    try {
      // First verify the user exists in the database
      const userExists = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.id, session.user.id),
      });
      
      if (!userExists) {
        console.warn(`User ${session.user.id} not found in database despite valid session`);
        // Return empty array instead of throwing error
        return [];
      }

      let projects = await db
        .select()
        .from(projectsTable)
        .where(eq(projectsTable.user_id, session.user.id));

      if (projects.length === 0) {
        // Delegate rather than inline: createDefaultProject takes a lock on the
        // user row and re-checks, so two concurrent page loads for a brand-new
        // user cannot both create a hub. This block used to do its own
        // check-then-create, which is how 27 users ended up with two.
        try {
          const defaultProject = await createDefaultProject(session.user.id);
          projects = [defaultProject];
        } catch (error) {
          console.error('Error creating default project:', error);
          // Return empty array instead of throwing error
          return [];
        }
      }

      return projects;
    } catch (error) {
      console.error('Error in getProjects:', error);
      // Return empty array instead of re-throwing
      return [];
    }
  });
}

export async function updateProjectName(projectUuid: string, newName: string) {
  return withProjectAuth(projectUuid, async (_, project) => {
    const [updatedProject] = await db
      .update(projectsTable)
      .set({ name: newName })
      .where(eq(projectsTable.uuid, project.uuid))
      .returning();

    return updatedProject;
  });
}

export async function deleteProject(projectUuid: string) {
  return withProjectAuth(projectUuid, async (session, project) => {
    // Check if this is the last project
    const projectCount = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.user_id, session.user.id));

    if (projectCount.length === 1) {
      throw new Error('Cannot delete the last project');
    }

    await db.delete(projectsTable).where(eq(projectsTable.uuid, project.uuid));

    return { success: true };
  });
}

export async function setActiveProject(projectUuid: string) {
  return withProjectAuth(projectUuid, async (_, project) => {
    return project;
  });
}
