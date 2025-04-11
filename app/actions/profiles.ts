'use server';

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { profilesTable, projectsTable } from '@/db/schema';
import { type Locale } from '@/i18n/config';
import { getAuthSession } from '@/lib/auth';
import { Profile } from '@/types/profile';

export async function createProfile(currentProjectUuid: string, name: string) {
  const session = await getAuthSession();
  
  if (!session || !session.user.id) {
    throw new Error('Unauthorized - you must be logged in to create profiles');
  }
  
  // Verify the project belongs to the current user
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.uuid, currentProjectUuid))
    .limit(1);

  if (project.length === 0) {
    throw new Error('Project not found');
  }
  
  if (project[0].user_id !== session.user.id) {
    throw new Error('Unauthorized - you do not have access to this project');
  }

  const profile = await db
    .insert(profilesTable)
    .values({
      name,
      project_uuid: currentProjectUuid,
    })
    .returning();

  return profile[0];
}

export async function getProfile(profileUuid: string) {
  const profile = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.uuid, profileUuid))
    .limit(1);

  if (profile.length === 0) {
    throw new Error('Profile not found');
  }

  return profile[0];
}

export async function getProfiles(currentProjectUuid: string) {
  const session = await getAuthSession();
  
  if (!session || !session.user.id) {
    throw new Error('Unauthorized - you must be logged in to view profiles');
  }
  
  // Verify the project belongs to the current user
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.uuid, currentProjectUuid))
    .limit(1);

  if (project.length === 0) {
    throw new Error('Project not found');
  }
  
  if (project[0].user_id !== session.user.id) {
    throw new Error('Unauthorized - you do not have access to this project');
  }
  
  return await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.project_uuid, currentProjectUuid));
}

export async function getProjectActiveProfile(currentProjectUuid: string) {
  const session = await getAuthSession();
  
  if (!session) {
    // This function is also used internally by API authentication
    // So we'll do authorization check later based on project ownership
    // rather than failing early if there's no session
  }
  
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.uuid, currentProjectUuid))
    .limit(1);

  if (project.length === 0) {
    throw new Error('Project not found');
  }

  // If we have a session, verify the project belongs to the current user
  if (session?.user.id && project[0].user_id !== session.user.id) {
    throw new Error('Unauthorized - you do not have access to this project');
  }

  const currentProject = project[0];

  // Try to get active profile if set
  if (currentProject.active_profile_uuid) {
    const activeProfile = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.uuid, currentProject.active_profile_uuid))
      .limit(1);

    if (activeProfile.length > 0) {
      return activeProfile[0];
    }
  }

  // If no active profile or not found, get all profiles
  const profiles = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.project_uuid, currentProjectUuid));

  // If there are profiles, use the first one and set it as active
  if (profiles.length > 0) {
    await db
      .update(projectsTable)
      .set({ active_profile_uuid: profiles[0].uuid })
      .where(eq(projectsTable.uuid, currentProjectUuid));

    return profiles[0];
  }

  // If no profiles exist, create a default one
  const defaultProfile = await db
    .insert(profilesTable)
    .values({
      name: 'Default Workspace',
      project_uuid: currentProjectUuid,
    })
    .returning();

  // Set it as active
  await db
    .update(projectsTable)
    .set({ active_profile_uuid: defaultProfile[0].uuid })
    .where(eq(projectsTable.uuid, currentProjectUuid));

  return defaultProfile[0];
}

export async function setProfileActive(
  projectUuid: string,
  profileUuid: string
) {
  const session = await getAuthSession();
  
  if (!session || !session.user.id) {
    throw new Error('Unauthorized - you must be logged in to update profiles');
  }
  
  // Verify the project belongs to the current user
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

  const updatedProject = await db
    .update(projectsTable)
    .set({ active_profile_uuid: profileUuid })
    .where(eq(projectsTable.uuid, projectUuid))
    .returning();

  if (updatedProject.length === 0) {
    throw new Error('Project not found');
  }

  return updatedProject[0];
}

export async function updateProfileName(profileUuid: string, newName: string) {
  const profile = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.uuid, profileUuid))
    .limit(1);

  if (profile.length === 0) {
    throw new Error('Profile not found');
  }

  const updatedProfile = await db
    .update(profilesTable)
    .set({ name: newName })
    .where(eq(profilesTable.uuid, profileUuid))
    .returning();

  return updatedProfile[0];
}

export async function updateProfile(profileUuid: string, data: Partial<Profile>) {
  const session = await getAuthSession();
  
  if (!session || !session.user.id) {
    throw new Error('Unauthorized - you must be logged in to update profiles');
  }

  const profile = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.uuid, profileUuid))
    .limit(1);

  if (profile.length === 0) {
    throw new Error('Profile not found');
  }

  const updatedProfile = await db
    .update(profilesTable)
    .set(data)
    .where(eq(profilesTable.uuid, profileUuid))
    .returning();

  return updatedProfile[0];
}

export async function deleteProfile(profileUuid: string) {
  const profile = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.uuid, profileUuid))
    .limit(1);

  if (profile.length === 0) {
    throw new Error('Profile not found');
  }

  // Check if this is the last profile
  const profileCount = await db.select().from(profilesTable);

  if (profileCount.length === 1) {
    throw new Error('Cannot delete the last profile');
  }

  await db.delete(profilesTable).where(eq(profilesTable.uuid, profileUuid));

  return { success: true };
}

export async function setActiveProfile(profileUuid: string) {
  const profile = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.uuid, profileUuid))
    .limit(1);

  if (profile.length === 0) {
    throw new Error('Profile not found');
  }

  return profile[0];
}

export async function getActiveProfileLanguage(): Promise<Locale | null> {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return null;
    }

    // Get current project
    const project = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.user_id, session.user.id))
      .limit(1);

    if (!project[0]?.active_profile_uuid) {
      return null;
    }

    // Get profile language
    const profile = await db
      .select({ language: profilesTable.language })
      .from(profilesTable)
      .where(eq(profilesTable.uuid, project[0].active_profile_uuid))
      .limit(1);

    return profile[0]?.language || null;
  } catch (error) {
    console.error('Failed to get active profile language:', error);
    return null;
  }
}

export async function updateProfilePublicStatus(profileUuid: string, isPublic: boolean) {
  const session = await getAuthSession();
  
  if (!session || !session.user.id) {
    throw new Error('Unauthorized - you must be logged in to update profile visibility');
  }

  const profile = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.uuid, profileUuid))
    .limit(1);

  if (profile.length === 0) {
    throw new Error('Profile not found');
  }

  // Verify the profile belongs to the current user
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.uuid, profile[0].project_uuid))
    .limit(1);

  if (project.length === 0) {
    throw new Error('Project not found');
  }
  
  if (project[0].user_id !== session.user.id) {
    throw new Error('Unauthorized - you do not have access to this profile');
  }

  const updatedProfile = await db
    .update(profilesTable)
    .set({ is_public: isPublic })
    .where(eq(profilesTable.uuid, profileUuid))
    .returning();

  return updatedProfile[0];
}
