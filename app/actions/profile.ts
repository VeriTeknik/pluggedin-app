'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { projectsTable, profilesTable } from '@/db/schema';
import { reserveUsername } from './social';

export async function updateProfileUsername(profileUuid: string, username: string) {
  try {
    // First get the project_uuid from the profile
    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.uuid, profileUuid),
      columns: { project_uuid: true }
    });

    if (!profile?.project_uuid) {
      return { success: false, error: 'Project not found for this profile' };
    }

    // Then get the user_id from the project
    const project = await db.query.projectsTable.findFirst({
      where: eq(projectsTable.uuid, profile.project_uuid),
      columns: { user_id: true }
    });

    if (!project?.user_id) {
      return { success: false, error: 'User ID not found for this project' };
    }

    const result = await reserveUsername(project.user_id, username);
    return result;
  } catch (error) {
    console.error('Error updating username:', error);
    return { success: false, error: 'An unexpected error occurred while updating username' };
  }
} 