import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { profilesTable, projectsTable, users } from '@/db/schema';

// Callers must authorize the project before entering this helper.
export async function getProjectActiveProfileInternal(currentProjectUuid: string) {
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.uuid, currentProjectUuid))
    .limit(1);

  if (project.length === 0) {
    throw new Error('Project not found');
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
    userIsAdmin: users.is_admin,
  };

  // Try to get active profile if set, joining with users table
  if (currentProject.active_profile_uuid) {
    const activeProfileData = await db
      .select(selectFields)
      .from(profilesTable)
      .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
      .innerJoin(users, eq(projectsTable.user_id, users.id))
      .where(and(eq(profilesTable.uuid, currentProject.active_profile_uuid), eq(profilesTable.project_uuid, currentProjectUuid)))
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
