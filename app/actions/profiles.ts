'use server';

import { eq } from 'drizzle-orm';
import { z } from 'zod';

// Removed Session import as it caused issues and wasn't used effectively
import { db } from '@/db';
import { profilesTable, projectsTable, users } from '@/db/schema';
import { type Locale } from '@/i18n/config';
import { getProjectActiveProfileInternal } from '@/lib/active-profile-internal';
import { withAuth, withProfileAuth, withProjectAuth } from '@/lib/auth-helpers';
import { Profile } from '@/types/profile';

// Validation schemas
const uuidSchema = z.string().uuid('Invalid UUID format');
const nameSchema = z.string().min(1).max(100);


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
        username: users.username, // username comes from the joined users table
        is_admin: users.is_admin,
      })
      .from(profilesTable)
      .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
      .innerJoin(users, eq(projectsTable.user_id, users.id))
      .where(eq(profilesTable.project_uuid, validatedProjectUuid));

    return profiles;
  });
}

export async function getProjectActiveProfile(currentProjectUuid: string) {
  return withProjectAuth(uuidSchema.parse(currentProjectUuid), () =>
    getProjectActiveProfileInternal(currentProjectUuid)
  );
}

export async function setProfileActive(
  projectUuid: string,
  profileUuid: string
) {
  // Validate inputs
  const validatedProjectUuid = uuidSchema.parse(projectUuid);
  const validatedProfileUuid = uuidSchema.parse(profileUuid);
  
  return withProjectAuth(validatedProjectUuid, async (session, project) => {
    // Owning the project is not enough. The foreign key on
    // active_profile_uuid points at profiles.uuid and accepts any row, so
    // without this a caller could aim their own Hub at another tenant's
    // profile — and registry-servers.ts resolves the working profile as
    // `activeProject.active_profile_uuid`, so the aim is what gets acted on.
    const target = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.uuid, validatedProfileUuid),
      columns: { uuid: true, project_uuid: true },
    });

    if (!target || target.project_uuid !== validatedProjectUuid) {
      throw new Error('Profile does not belong to this project');
    }

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
