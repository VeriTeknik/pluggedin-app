'use server';

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { profilesTable, projectsTable } from '@/db/schema';

export async function createProject(name: string) {
  return await db.transaction(async (tx) => {
    // First create the project with a temporary self-referential UUID
    const [project] = await tx
      .insert(projectsTable)
      .values({
        name,
        active_profile_uuid: null,
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
}

export async function getProject(projectUuid: string) {
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.uuid, projectUuid))
    .limit(1);

  if (project.length === 0) {
    throw new Error('Project not found');
  }

  return project[0];
}

export async function getProjects() {
  let projects = await db.select().from(projectsTable);

  if (projects.length === 0) {
    const defaultProject = await createProject('Default Hub');
    projects = [defaultProject];
  }

  return projects;
}

export async function updateProjectName(projectUuid: string, newName: string) {
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.uuid, projectUuid))
    .limit(1);

  if (project.length === 0) {
    throw new Error('Project not found');
  }

  const updatedProject = await db
    .update(projectsTable)
    .set({ name: newName })
    .where(eq(projectsTable.uuid, projectUuid))
    .returning();

  return updatedProject[0];
}

export async function deleteProject(projectUuid: string) {
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.uuid, projectUuid))
    .limit(1);

  if (project.length === 0) {
    throw new Error('Project not found');
  }

  // Check if this is the last project
  const projectCount = await db.select().from(projectsTable);

  if (projectCount.length === 1) {
    throw new Error('Cannot delete the last project');
  }

  await db.delete(projectsTable).where(eq(projectsTable.uuid, projectUuid));

  return { success: true };
}

export async function setActiveProject(projectUuid: string) {
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.uuid, projectUuid))
    .limit(1);

  if (project.length === 0) {
    throw new Error('Project not found');
  }

  return project[0];
}
