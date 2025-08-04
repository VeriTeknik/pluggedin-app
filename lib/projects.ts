import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { db } from '@/db';
import { projectsTable } from '@/db/schema';

const CURRENT_PROJECT_KEY = 'pluggedin-current-project';

export async function getCurrentProject(userId: string, preferredProjectUuid?: string | null) {
  try {
    // Get all projects for the user
    const userProjects = await db
      .select()
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
    
    // Try to get the stored project preference from cookies
    // Note: We can't access localStorage in server components
    try {
      const headersList = await headers();
      const cookie = headersList.get('cookie');
      if (cookie) {
        // Look for the project UUID in cookies (would need to be set from client)
        // For now, we'll just return the first project
      }
    } catch (e) {
      // Headers not available or error accessing them
    }
    
    // Return the first project as fallback
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
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.user_id, userId));
    
    return userProjects;
  } catch (error) {
    console.error('Error fetching user projects:', error);
    return [];
  }
}