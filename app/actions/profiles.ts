'use server';

import { eq } from 'drizzle-orm';
import { z } from 'zod';

// Removed Session import as it caused issues and wasn't used effectively
import { db } from '@/db';
import { profilesTable, projectsTable, users } from '@/db/schema';
import { type Locale } from '@/i18n/config';
import { getAuthSession } from '@/lib/auth';
import { withAuth, withProfileAuth,withProjectAuth } from '@/lib/auth-helpers';
import { Profile } from '@/types/profile';

// Validation schemas
const uuidSchema = z.string().uuid('Invalid UUID format');
const nameSchema = z.string().min(1).max(100);

export async function createProfile(currentProjectUuid: string, name: string) {
  // Validate inputs
  const validatedProjectUuid = uuidSchema.parse(currentProjectUuid);
  const validatedName = nameSchema.parse(name);
  
  return withProjectAuth(validatedProjectUuid, async (session, project) => {
    const profile = await db
      .insert(profilesTable)
      .values({
        name: validatedName,
        project_uuid: validatedProjectUuid,
      })
      .returning();

    return profile[0];
  });
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
  // Validate input
  const validatedProjectUuid = uuidSchema.parse(currentProjectUuid);
  
  return withProjectAuth(validatedProjectUuid, async (session, project) => {
    // Get profiles with username from users table
    const profiles = await db
      .select({
        uuid: profilesTable.uuid,
        name: profilesTable.name,
        project_uuid: profilesTable.project_uuid,
        created_at: profilesTable.created_at,
        language: profilesTable.language,
        enabled_capabilities: profilesTable.enabled_capabilities,
        // Removed bio, is_public, avatar_url as they are on the users table now
        username: users.username // username comes from the joined users table
      })
      .from(profilesTable)
      .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
      .innerJoin(users, eq(projectsTable.user_id, users.id))
      .where(eq(profilesTable.project_uuid, validatedProjectUuid));

    return profiles;
  });
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
  if (session && session.user && project[0].user_id !== session.user.id) { // Explicitly check session.user too
    throw new Error('Unauthorized - you do not have access to this project');
  }

  const currentProject = project[0];

  // Define the fields to select, combining profile and user data
  const selectFields = {
    // Profile fields
    uuid: profilesTable.uuid,
    name: profilesTable.name,
    project_uuid: profilesTable.project_uuid,
    created_at: profilesTable.created_at,
    language: profilesTable.language,
    enabled_capabilities: profilesTable.enabled_capabilities,
    // User fields (prefixing to avoid potential name clashes if needed later)
    userId: users.id,
    username: users.username,
    userEmail: users.email, // Added email as it might be useful context
    userBio: users.bio,
    userAvatarUrl: users.avatar_url,
    userIsPublic: users.is_public,
  };

  // Try to get active profile if set, joining with users table
  if (currentProject.active_profile_uuid) {
    const activeProfileData = await db
      .select(selectFields)
      .from(profilesTable)
      .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
      .innerJoin(users, eq(projectsTable.user_id, users.id))
      .where(eq(profilesTable.uuid, currentProject.active_profile_uuid))
      .limit(1);

    if (activeProfileData.length > 0) {
      // TODO: Define a proper return type combining Profile and User fields
      return activeProfileData[0]; // Removed 'as any' cast
    }
  }

  // If no active profile or not found, get all profiles for the project, joining with users
  const profilesData = await db
    .select(selectFields)
    .from(profilesTable)
    .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
    .innerJoin(users, eq(projectsTable.user_id, users.id))
    .where(eq(profilesTable.project_uuid, currentProjectUuid));

  // If there are profiles, use the first one and set it as active
  if (profilesData.length > 0) {
    await db
      .update(projectsTable)
      .set({ active_profile_uuid: profilesData[0].uuid })
      .where(eq(projectsTable.uuid, currentProjectUuid));

    // TODO: Define a proper return type combining Profile and User fields
    return profilesData[0]; // Removed 'as any' cast
  }

  // If no profiles exist, create a default one
  const insertedDefaultProfile = await db
    .insert(profilesTable)
    .values({
      name: 'Default Workspace',
      project_uuid: currentProjectUuid,
    })
    .returning({ uuid: profilesTable.uuid }); // Only return the UUID

  const defaultProfileUuid = insertedDefaultProfile[0].uuid;

  // Set it as active
  await db
    .update(projectsTable)
    .set({ active_profile_uuid: defaultProfileUuid })
    .where(eq(projectsTable.uuid, currentProjectUuid));

  // Now fetch the newly created default profile with user data
  const defaultProfileData = await db
    .select(selectFields)
    .from(profilesTable)
    .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
    .innerJoin(users, eq(projectsTable.user_id, users.id))
    .where(eq(profilesTable.uuid, defaultProfileUuid))
    .limit(1);

  if (defaultProfileData.length === 0) {
    // This should ideally not happen
    throw new Error('Failed to fetch newly created default profile');
  }

  // TODO: Define a proper return type combining Profile and User fields
  return defaultProfileData[0]; // Removed 'as any' cast
}

export async function setProfileActive(
  projectUuid: string,
  profileUuid: string
) {
  // Validate inputs
  const validatedProjectUuid = uuidSchema.parse(projectUuid);
  const validatedProfileUuid = uuidSchema.parse(profileUuid);
  
  return withProjectAuth(validatedProjectUuid, async (session, project) => {
    const updatedProject = await db
      .update(projectsTable)
      .set({ active_profile_uuid: validatedProfileUuid })
      .where(eq(projectsTable.uuid, validatedProjectUuid))
      .returning();

    if (updatedProject.length === 0) {
      throw new Error('Project not found');
    }

    return updatedProject[0];
  });
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
  // Validate input
  const validatedProfileUuid = uuidSchema.parse(profileUuid);
  
  return withProfileAuth(validatedProfileUuid, async (session, profile) => {
    // Now proceed with update
    const updatedProfile = await db
      .update(profilesTable)
      .set(data)
      .where(eq(profilesTable.uuid, validatedProfileUuid))
      .returning();

    return updatedProfile[0];
  });
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
    return await withAuth(async (session) => {
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
    });
  } catch (error) {
    // If auth fails, return null (for non-authenticated contexts)
    return null;
  }
}

// Removed updateProfilePublicStatus function as is_public is now on the users table
// and should be updated via user-related actions (e.g., updateUserSocial in social.ts)
