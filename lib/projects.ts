import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { projectsTable } from '@/db/schema';

export async function getCurrentProject(userId: string) {
  // Get all projects for the user
  const userProjects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.user_id, userId));
  
  if (userProjects.length === 0) {
    return null;
  }
  
  // For now, return the first project
  // TODO: Implement proper project selection based on active_profile_uuid
  return userProjects[0];
}