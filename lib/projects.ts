import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { db } from '@/db';
import { projectsTable } from '@/db/schema';

const CURRENT_PROJECT_KEY = 'pluggedin-current-project';

export async function getCurrentProject(userId: string, preferredProjectUuid?: string | null) {
  try {
    // Get all projects for the user
    const userProjects = await db
      .select({
        uuid: projectsTable.uuid,
        name: projectsTable.name,
        created_at: projectsTable.created_at,
        active_profile_uuid: projectsTable.active_profile_uuid,
        user_id: projectsTable.user_id,
        embedded_chat_enabled: projectsTable.embedded_chat_enabled,
        embedded_chat_uuid: projectsTable.embedded_chat_uuid,
      })
      .from(projectsTable)
      .where(eq(projectsTable.user_id, userId));
    
    if (userProjects.length === 0) {
      return null;
    }
    
    // If a preferred project UUID is provided, try to find it
    if (preferredProjectUuid) {
      const preferredProject = userProjects.find(p => p.uuid === preferredProjectUuid);
      if (preferredProject) {
        return preferredProject;
      }
    }
    
    // Return the first project as fallback
    // Note: This is a server function, so it can't access client-side state
    // The preferredProjectUuid should be passed from the client
    return userProjects[0];
  } catch (error) {
    console.error('Error fetching current project:', error);
    // Return null on error instead of throwing
    return null;
  }
}

// Helper function to get all projects for a user
export async function getUserProjects(userId: string) {
  try {
    const userProjects = await db
      .select({
        uuid: projectsTable.uuid,
        name: projectsTable.name,
        created_at: projectsTable.created_at,
        active_profile_uuid: projectsTable.active_profile_uuid,
        user_id: projectsTable.user_id,
        embedded_chat_enabled: projectsTable.embedded_chat_enabled,
        embedded_chat_uuid: projectsTable.embedded_chat_uuid,
      })
      .from(projectsTable)
      .where(eq(projectsTable.user_id, userId));
    
    return userProjects;
  } catch (error) {
    console.error('Error fetching user projects:', error);
    return [];
  }
}