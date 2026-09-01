'use server';

// Consolidated imports
import { and, desc, eq } from 'drizzle-orm'; 
import { revalidatePath } from 'next/cache';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { z } from 'zod';

import { logAuditEvent } from '@/app/actions/audit-logger';
import { createShareableTemplate } from '@/app/actions/mcp-servers';
import { db } from '@/db';
// Ensure languageEnum is imported correctly from schema
import { embeddedChatsTable, languageEnum, mcpServersTable, profilesTable, projectsTable, sharedCollectionsTable, sharedMcpServersTable, users } from '@/db/schema'; 
import { EmbeddedChat, SharedCollection, SharedMcpServer, UsernameAvailability } from '@/types/social';
// We'll likely need the User type more often
type User = typeof users.$inferSelect;
// Define the type for the language enum values explicitly
type LanguageCode = typeof languageEnum.enumValues[number]; 

import { getAuthSession } from '@/lib/auth';
import { withAuth, withProfileAuth } from '@/lib/auth-helpers';
import type { PublicUser } from '@/lib/public-user';
import { toPublicUser } from '@/lib/public-user';
import { sanitizeCollectionContent, sanitizeServerTemplate } from '@/lib/server-template';

// Additional validation schemas
const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * The auth helpers deny an anonymous caller by redirecting, which they signal
 * by throwing. That has to reach Next so the browser actually lands on /login;
 * the broad `catch` blocks in this file would otherwise turn it into a generic
 * "an error occurred" result and strand the user where they were.
 */
function rethrowIfRedirect(error: unknown): void {
  if (isRedirectError(error)) {
    throw error;
  }
}

/** Upper bound on any caller-supplied list size, so a single call cannot pull the whole table. */
const MAX_LIST_LIMIT = 100;

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 10;
  }
  return Math.min(Math.max(1, Math.trunc(limit)), MAX_LIST_LIMIT);
}

/** The session user's id, or undefined for an anonymous caller. */
async function getCurrentUserId(): Promise<string | undefined> {
  const session = await getAuthSession();
  return session?.user?.id;
}


/** Whether the caller owns `profileUuid`. False for anonymous callers. */
async function viewerOwnsProfile(profileUuid: string): Promise<boolean> {
  const currentUserId = await getCurrentUserId();
  if (!currentUserId) {
    return false;
  }
  return userOwnsProfile(currentUserId, profileUuid);
}

// Validation schema for username
const usernameSchema = z.string()
  .min(3, { message: 'Username must be at least 3 characters long' })
  .max(30, { message: 'Username must be at most 30 characters long' })
  .regex(/^[a-zA-Z0-9_-]+$/, {
    message: 'Username can only contain letters, numbers, underscores, and hyphens'
  });

/**
 * Check if a username is available
 * @param username The username to check
 * @returns Object indicating if the username is available and error message if not
 */
export async function checkUsernameAvailability(username: string): Promise<UsernameAvailability> {
  try {
    const validationResult = usernameSchema.safeParse(username);
    if (!validationResult.success) {
      return {
        available: false,
        message: 'Invalid username format'
      };
    }
    // Check if username exists in the users table
    const existingUser = await db.query.users.findFirst({
      where: eq(users.username, username),
      columns: { id: true },
    });
    return {
      available: !existingUser,
      message: existingUser ? 'Username is already taken' : undefined
    };
  } catch (error) {
    console.error('Error checking username availability:', error);
    return {
      available: false,
      message: 'An error occurred while checking username availability'
    };
  }
}

/**
 * Reserve a username for a user
 * @param userId The ID of the user to update
 * @param username The username to reserve
 * @returns Success status or error information
 */
export async function reserveUsername(userId: string, username: string): Promise<{ success: boolean; user?: PublicUser; error?: string }> {
  try {
    // `userId` arrives from the client: a caller may only claim a username for
    // themselves, never for another account.
    return await withAuth(async (session) => {
    if (session.user.id !== userId) {
      return { success: false, error: 'Unauthorized' };
    }

    // First verify the user exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!existingUser) {
      console.error('User not found with ID:', userId);
      return {
        success: false,
        error: 'User not found'
      };
    }

    const availability = await checkUsernameAvailability(username);
    if (!availability.available) {
      return {
        success: false,
        error: availability.message || 'Username is not available'
      };
    }

    // Update user with the new username
    try {
      const [updatedUser] = await db.update(users)
        .set({ 
          username,
          updated_at: new Date() // Ensure updated_at is set
        })
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) {
        console.error('Failed to update username for user:', userId);
        return {
          success: false,
          error: 'Failed to update username'
        };
      }

      // Log the action - Fetch profileUuid associated with userId for logging context
      const project = await db.query.projectsTable.findFirst({ 
        where: eq(projectsTable.user_id, userId) 
      });
      // Profile might not exist or be relevant in the new model, adjust logging if needed
      const profile = project ? await db.query.profilesTable.findFirst({ 
        where: eq(profilesTable.project_uuid, project.uuid) 
      }) : null;

      // Consider changing log type/metadata if profiles are less central
      await logAuditEvent({
        profileUuid: profile?.uuid, 
        type: 'PROFILE', // Reverted back to PROFILE as 'USER' might not be a valid AuditLogType yet
        action: 'RESERVE_USERNAME',
        metadata: { username, userId }, 
      });

      // Revalidate paths
      revalidatePath('/settings');

      return {
        success: true,
        user: toPublicUser(updatedUser)
      };
    } catch (updateError) {
      console.error('Error updating username:', updateError);
      return {
        success: false,
        error: 'Database error while updating username'
      };
    }
    });
  } catch (error) {
    rethrowIfRedirect(error);
    console.error('Error in reserveUsername:', error);
    return {
      success: false,
      error: 'An unexpected error occurred while reserving the username'
    };
  }
}



/**
 * Update user social information (formerly updateProfileSocial)
 * @param userId The ID of the user to update
 * @param data The user data to update (bio, is_public, avatar_url, language)
 * @returns The updated user or error information
 */
export async function updateUserSocial(
  userId: string,
  data: {
    bio?: string;
    is_public?: boolean;
    avatar_url?: string;
    language?: string; // Added language
  }
): Promise<{ success: boolean; user?: PublicUser; error?: string }> {
  try {
    // `userId` arrives from the client: without this check anyone could flip
    // another account's `is_public` flag and rewrite its bio.
    return await withAuth(async (session) => {
    if (session.user.id !== userId) {
      return { success: false, error: 'Unauthorized' };
    }

    // Update the users table directly
    // Use Omit to exclude language initially, then add it back if valid
    const updateData: Partial<Omit<User, 'language'>> & { updated_at: Date } = { 
      ...data, 
      updated_at: new Date() 
    };
    
    // Prepare the final update object, potentially including language
    const finalUpdateData: Partial<User> & { updated_at: Date } = { ...updateData };

    if (data.language !== undefined) {
      if (!languageEnum.enumValues.includes(data.language as LanguageCode)) {
        return { success: false, error: 'Invalid language code' };
      }
      // Assign the validated string directly. Drizzle handles the enum type.
      finalUpdateData.language = data.language as LanguageCode; 
    } else {
       // If language is explicitly passed as undefined, remove it 
       delete finalUpdateData.language; 
    }


    const [updatedUser] = await db.update(users)
      .set(finalUpdateData) // Use the correctly prepared update data
      .where(eq(users.id, userId))
      .returning();
      
    if (!updatedUser) {
      return {
        success: false,
        error: 'User not found or could not be updated'
      };
    }

    // Log the action - Adjust logging context if needed
    // await logAuditEvent({ userId, type: 'USER', action: 'UPDATE_USER_SOCIAL', metadata: data }); 

    // Revalidate paths
    revalidatePath('/settings');
    if (updatedUser.username) {
    }
    
    return {
      success: true,
      user: toPublicUser(updatedUser)
    };
    });
  } catch (error) {
    rethrowIfRedirect(error);
    console.error('Error updating user social data:', error);
    return {
      success: false,
      error: 'An error occurred while updating the user'
    };
  }
}








/**
 * Get shared MCP servers for a profile
 * @param profileUuid The UUID of the profile
 * @param limit The maximum number of results to return
 * @param includePrivate Whether to include private shared servers
 * @returns An array of shared MCP servers
 */
// Note: Sharing is still tied to profiles in this refactor. Adjust if needed.
export async function getSharedMcpServers(
  profileUuid: string,
  limit: number = 10,
  includePrivate: boolean = false
): Promise<SharedMcpServer[]> {
  try {
    // `includePrivate` is caller-supplied, so it only counts once we know the
    // caller actually owns the profile whose shares they are asking for.
    const canSeePrivate = includePrivate && (await viewerOwnsProfile(profileUuid));
    const whereClause = canSeePrivate
      ? eq(sharedMcpServersTable.profile_uuid, profileUuid)
      : and(
          eq(sharedMcpServersTable.profile_uuid, profileUuid),
          eq(sharedMcpServersTable.is_public, true)
        );
    const sharedServers = await db.query.sharedMcpServersTable.findMany({
      where: whereClause,
      limit: clampLimit(limit),
      with: {
        server: {
          columns: {
            uuid: true,
            name: true,
            description: true,
            type: true,
            command: true,
            args: true,
            url: true,
            created_at: true,
            status: true,
            source: true,
          }
        },
      },
      orderBy: (servers: any) => [desc(servers.created_at)], // Added explicit type
    });
    // The cast might still be needed depending on Drizzle's return type inference with relations
    return sharedServers as unknown as SharedMcpServer[]; 
  } catch (error) {
    console.error('Error getting shared MCP servers:', error);
    return [];
  }
}

/**
 * Get shared collections for a profile
 * @param profileUuid The UUID of the profile
 * @param limit The maximum number of results to return
 * @param includePrivate Whether to include private shared collections
 * @returns An array of shared collections
 */
// Note: Sharing is still tied to profiles in this refactor. Adjust if needed.
export async function getSharedCollections(
  profileUuid: string,
  limit: number = 10,
  includePrivate: boolean = false
): Promise<SharedCollection[]> {
  try {
    // Same rule as getSharedMcpServers: only the profile owner sees private shares.
    const canSeePrivate = includePrivate && (await viewerOwnsProfile(profileUuid));
    const whereClause = canSeePrivate
      ? eq(sharedCollectionsTable.profile_uuid, profileUuid)
      : and(
          eq(sharedCollectionsTable.profile_uuid, profileUuid),
          eq(sharedCollectionsTable.is_public, true)
        );
    const sharedCollections = await db.query.sharedCollectionsTable.findMany({
      where: whereClause,
      limit: clampLimit(limit),
      orderBy: (collections: any) => [desc(collections.created_at)], // Added explicit type
    });
    return sharedCollections.map((c: any) => ({
      ...c,
      content: sanitizeCollectionContent(c.content),
    })) as unknown as SharedCollection[];
  } catch (error) {
    console.error('Error getting shared collections:', error);
    return [];
  }
}

/**
 * Get embedded chats for a profile
 * @param profileUuid The UUID of the profile
 * @param limit The maximum number of results to return
 * @param includePrivate Whether to include private embedded chats
 * @returns An array of embedded chats
 */
// Note: Sharing is still tied to profiles in this refactor. Adjust if needed.


/**
 * Share an MCP server to the user's profile
 * @param profileUuid The UUID of the profile sharing the server
 * @param serverUuid The UUID of the MCP server to share
 * @param title The title for the shared server
 * @param description The description for the shared server
 * @param isPublic Whether the shared server should be public
 * @param customTemplate Optional manually edited template that overrides the auto-generated one
 * @returns Success status and shared server info if successful
 */
// Note: Sharing is still tied to profiles in this refactor. Adjust if needed.
export async function shareMcpServer(
  profileUuid: string,
  serverUuid: string,
  title: string,
  description?: string,
  isPublic: boolean = true,
  customTemplate?: any
): Promise<{ success: boolean; sharedServer?: SharedMcpServer; error?: string }> {
  try {
    const validatedProfileUuid = uuidSchema.parse(profileUuid);
    const validatedServerUuid = uuidSchema.parse(serverUuid);

    // The caller must own the profile they are sharing under, and the server
    // must live under that same profile - otherwise any serverUuid in the
    // system could be republished by anyone who learns it.
    return await withProfileAuth(validatedProfileUuid, async () => {
    const server = await db.query.mcpServersTable.findFirst({
      where: eq(mcpServersTable.uuid, validatedServerUuid),
    });
    if (!server || server.profile_uuid !== validatedProfileUuid) {
      return { success: false, error: 'Server not found' };
    }
    // Sanitise whatever we are about to store. `customTemplate` comes straight
    // from the client - the share wizard lets the owner edit it - so it cannot
    // be trusted to have had its credentials removed.
    const serverTemplate = sanitizeServerTemplate(customTemplate || await createShareableTemplate({
      ...server,
      config: server.config as Record<string, any> | null
    }));
    const existingShare = await db.query.sharedMcpServersTable.findFirst({
      where: and(
        eq(sharedMcpServersTable.profile_uuid, profileUuid),
        eq(sharedMcpServersTable.server_uuid, serverUuid)
      ),
    });
    let finalSharedServer;
    if (existingShare) {
      const [updatedShare] = await db.update(sharedMcpServersTable)
        .set({ title, description, is_public: isPublic, updated_at: new Date(), template: serverTemplate })
        .where(eq(sharedMcpServersTable.uuid, existingShare.uuid))
        .returning();
      finalSharedServer = updatedShare;
      await logAuditEvent({ profileUuid, type: 'PROFILE', action: 'UPDATE_SHARED_SERVER', metadata: { server_uuid: serverUuid, title } });
    } else {
      const [newShare] = await db.insert(sharedMcpServersTable)
        .values({ profile_uuid: profileUuid, server_uuid: serverUuid, title, description, is_public: isPublic, template: serverTemplate })
        .returning();
      finalSharedServer = newShare;
      await logAuditEvent({ profileUuid, type: 'PROFILE', action: 'SHARE_SERVER', metadata: { server_uuid: serverUuid, title } });
    }
    // Revalidate paths
    return {
      success: true,
      sharedServer: finalSharedServer as unknown as SharedMcpServer
    };
    });
  } catch (error) {
    rethrowIfRedirect(error);
    console.error('Error sharing MCP server:', error);
    return {
      success: false,
      error: 'An error occurred while sharing the server'
    };
  }
}

/**
 * Get a single shared MCP server
 * @param sharedServerUuid UUID of the shared server to get
 * @returns The shared server (including its server data) or null if not found
 */
// Note: Sharing is still tied to profiles in this refactor. Adjust if needed.
export async function getSharedMcpServer(sharedServerUuid: string): Promise<SharedMcpServer | null> {
  try {
    // Get the shared server with its server data, profile, project, and user data
    const sharedServerData = await db.query.sharedMcpServersTable.findFirst({
      where: eq(sharedMcpServersTable.uuid, sharedServerUuid),
      with: {
        server: true, // Keep server relation
        profile: {
          columns: { name: true, uuid: true }, // Select necessary profile fields
          with: {
            project: {
              with: {
                user: { // Public attribution fields only - never email
                  columns: { username: true, name: true }
                }
              }
            }
          }
        }
      }
    });


    if (!sharedServerData) {
      return null;
    }

    // A private share, and its template, belongs to the owner alone.
    if (
      !sharedServerData.is_public &&
      !(await viewerOwnsProfile(sharedServerData.profile_uuid))
    ) {
      return null;
    }

    // Determine the display name
    const user = sharedServerData.profile?.project?.user;
    const profile = sharedServerData.profile;
    const sharedByName = user?.username || user?.name || profile?.name || 'Unknown User';

    // Construct the final object without nested profile/project/user
    const result = {
      uuid: sharedServerData.uuid,
      profile_uuid: sharedServerData.profile_uuid,
      server_uuid: sharedServerData.server_uuid,
      title: sharedServerData.title,
      description: sharedServerData.description,
      is_public: sharedServerData.is_public,
      // Shares created before templates were sanitised on write still hold the
      // owner's connection details, so scrub on the way out too.
      template: sanitizeServerTemplate(sharedServerData.template),
      created_at: sharedServerData.created_at,
      updated_at: sharedServerData.updated_at,
      profile_username: sharedByName, // Use determined name
      server: sharedServerData.server ? {
        ...sharedServerData.server,
        // If template contains these properties, include them
        originalServerUuid: sharedServerData.template?.originalServerUuid,
        sharedBy: sharedServerData.template?.sharedBy, // This might be redundant now
        customInstructions: sharedServerData.template?.customInstructions,
      } : undefined
    };

    // Remove nested profile/project/user data before returning
    // @ts-expect-error - Drizzle's type inference might struggle here, but structure is correct
    delete result.profile;
    // @ts-expect-error - Also remove project if it was included implicitly
    delete result.project; 

    return result as unknown as SharedMcpServer;
  } catch (error) {
    console.error('Error getting shared MCP server:', error);
    return null;
  }
}


/**
 * Helper function to check if a user owns a profile through the project relationship
 * @param userId The user ID to check
 * @param profileUuid The profile UUID to verify ownership of
 * @returns True if the user owns the profile, false otherwise
 */
async function userOwnsProfile(userId: string, profileUuid: string): Promise<boolean> {
  try {
    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.uuid, profileUuid),
      with: {
        project: true
      }
    });
    
    return profile?.project?.user_id === userId;
  } catch (error) {
    console.error('Error checking profile ownership:', error);
    return false;
  }
}

/**
 * Unshare an MCP server from a profile
 * @param profileUuid The UUID of the profile (for backward compatibility)
 * @param sharedServerUuid The UUID of the shared server
 * @returns Success status and error message if applicable
 */
export async function unshareServer(
  profileUuid: string,
  sharedServerUuid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate inputs
    const validatedProfileUuid = uuidSchema.parse(profileUuid);
    const validatedSharedServerUuid = uuidSchema.parse(sharedServerUuid);
    
    return await withAuth(async (session) => {
    
    // First, get the shared server to find which profile owns it
    const sharedServer = await db.query.sharedMcpServersTable.findFirst({
      where: eq(sharedMcpServersTable.uuid, sharedServerUuid),
    });
    
    if (!sharedServer) {
      return {
        success: false,
        error: 'Shared server not found'
      };
    }
    
    // Check if the current user owns the profile that shared this server
    const ownsProfile = await userOwnsProfile(session.user.id, sharedServer.profile_uuid);
    
    if (!ownsProfile) {
      return {
        success: false,
        error: 'You do not have permission to unshare this server'
      };
    }
    
    // Get server details before deletion for notification
    const serverDetails = await db.query.mcpServersTable.findFirst({
      where: eq(mcpServersTable.uuid, sharedServer.server_uuid),
    });
    
    // Delete the shared server
    await db.delete(sharedMcpServersTable)
      .where(eq(sharedMcpServersTable.uuid, sharedServerUuid));
      
    await logAuditEvent({
      profileUuid: sharedServer.profile_uuid,
      type: 'PROFILE', // Use string literal
      action: 'UNSHARE_SERVER',
      metadata: { shared_server_uuid: sharedServerUuid },
    });
    
    // Create a notification about the unsharing
    try {
      const { createNotification } = await import('@/app/actions/notifications');
      await createNotification({
        profileUuid: sharedServer.profile_uuid,
        type: 'SYSTEM',
        title: 'Server Unshared',
        message: `You have unshared the server "${sharedServer.title}". Users who already installed it will continue to have access.`,
        severity: 'INFO',
      });
    } catch (notifError) {
      console.error('Failed to create unshare notification:', notifError);
      // Continue with the unshare even if notification fails
    }
    
    // Revalidate paths
    
    return { success: true };
    });
  } catch (error) {
    rethrowIfRedirect(error);
    console.error('Error unsharing server:', error);
    return {
      success: false,
      error: 'An error occurred while unsharing the server'
    };
  }
}

/**
 * Share a collection to the user's profile
 * @param profileUuid The UUID of the profile sharing the collection
 * @param title The title for the shared collection
 * @param description The description for the shared collection
 * @param content The content data for the collection
 * @param isPublic Whether the shared collection should be public
 * @returns Success status and shared collection info if successful
 */
// Note: Sharing is still tied to profiles in this refactor. Adjust if needed.
export async function shareCollection(
  profileUuid: string,
  title: string,
  description: string | undefined,
  content: any,
  isPublic: boolean = true
): Promise<{ success: boolean; sharedCollection?: SharedCollection; error?: string }> {
  try {
    // profileUuid arrives from the client; verify the session owns it before
    // writing anything under it (same pattern as unshareServer above).
    return await withProfileAuth(uuidSchema.parse(profileUuid), async () => {
    const [sharedCollection] = await db.insert(sharedCollectionsTable)
      .values({
        profile_uuid: profileUuid,
        title,
        description,
        content: sanitizeCollectionContent(content),
        is_public: isPublic,
      })
      .returning();
    await logAuditEvent({ profileUuid, type: 'PROFILE', action: 'SHARE_COLLECTION', metadata: { title } });
    // Revalidate paths
    return {
      success: true,
      sharedCollection: sharedCollection as unknown as SharedCollection
    };
    });
  } catch (error) {
    rethrowIfRedirect(error);
    console.error('Error sharing collection:', error);
    return {
      success: false,
      error: 'An error occurred while sharing the collection'
    };
  }
}

/**
 * Update a shared collection
 * @param profileUuid The UUID of the profile that owns the collection
 * @param sharedCollectionUuid The UUID of the shared collection to update
 * @param updates The updates to apply (title, description, content, isPublic)
 * @returns Success status and updated shared collection info if successful
 */
// Note: Sharing is still tied to profiles in this refactor. Adjust if needed.
export async function updateSharedCollection(
  profileUuid: string,
  sharedCollectionUuid: string,
  updates: {
    title?: string;
    description?: string;
    content?: any;
    isPublic?: boolean;
  }
): Promise<{ success: boolean; sharedCollection?: SharedCollection; error?: string }> {
  try {
    // profileUuid arrives from the client; verify the session owns it before
    // writing anything under it (same pattern as unshareServer above).
    return await withProfileAuth(uuidSchema.parse(profileUuid), async () => {
    const existingCollection = await db.query.sharedCollectionsTable.findFirst({
      where: and(
        eq(sharedCollectionsTable.uuid, sharedCollectionUuid),
        eq(sharedCollectionsTable.profile_uuid, profileUuid)
      ),
    });
    if (!existingCollection) {
      return {
        success: false,
        error: 'Shared collection not found or you do not have permission to update it'
      };
    }
    const updateData: any = { updated_at: new Date() };
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.content !== undefined) {
      updateData.content = sanitizeCollectionContent(updates.content);
    }
    if (updates.isPublic !== undefined) updateData.is_public = updates.isPublic;
    const [updatedCollection] = await db.update(sharedCollectionsTable)
      .set(updateData)
      .where(eq(sharedCollectionsTable.uuid, sharedCollectionUuid))
      .returning();
    await logAuditEvent({ profileUuid, type: 'PROFILE', action: 'UPDATE_SHARED_COLLECTION', metadata: { collection_uuid: sharedCollectionUuid } });
    // Revalidate paths
    return {
      success: true,
      sharedCollection: updatedCollection as unknown as SharedCollection
    };
    });
  } catch (error) {
    rethrowIfRedirect(error);
    console.error('Error updating shared collection:', error);
    return {
      success: false,
      error: 'An error occurred while updating the shared collection'
    };
  }
}

/**
 * Get a shared collection by its UUID
 * @param sharedCollectionUuid The UUID of the shared collection
 * @returns The shared collection or null if not found
 */
export async function getSharedCollection(sharedCollectionUuid: string): Promise<SharedCollection | null> {
  try {
    if (!sharedCollectionUuid) {
      console.error('No collection UUID provided');
      return null;
    }

    const collection = await db.query.sharedCollectionsTable.findFirst({
      where: eq(sharedCollectionsTable.uuid, sharedCollectionUuid),
      with: {
        profile: {
          with: {
            project: {
              with: {
                user: {
                  columns: {
                    id: true,
                    name: true,
                    username: true
                  }
                }
              }
            }
          }
        }
      }
    });

    // Looked up by uuid alone, so without this a collection the owner kept
    // private is readable — content included — by anyone holding its uuid.
    // The owner still gets their own: /collections/[uuid] calls this with no
    // authorization context and renders notFound() on null.
    if (!collection) {
      return null;
    }
    if (!collection.is_public && !(await viewerOwnsProfile(collection.profile_uuid))) {
      return null;
    }

    // Convert null to undefined for name field
    const modifiedCollection = {
      ...collection,
      content: sanitizeCollectionContent(collection.content),
      profile: {
        ...collection.profile,
        project: {
          ...collection.profile.project,
          user: {
            ...collection.profile.project.user,
            name: collection.profile.project.user.name || undefined
          }
        }
      }
    };

    return modifiedCollection as SharedCollection;
  } catch (error) {
    console.error('Error fetching shared collection:', error);
    return null;
  }
}

/**
 * Unshare a collection from a profile
 * @param profileUuid The UUID of the profile
 * @param sharedCollectionUuid The UUID of the shared collection
 * @returns Success status and error message if applicable
 */
// Note: Sharing is still tied to profiles in this refactor. Adjust if needed.
export async function unshareCollection(
  profileUuid: string,
  sharedCollectionUuid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // profileUuid arrives from the client; verify the session owns it before
    // writing anything under it (same pattern as unshareServer above).
    return await withProfileAuth(uuidSchema.parse(profileUuid), async () => {
    const sharedCollection = await db.query.sharedCollectionsTable.findFirst({
      where: and(
        eq(sharedCollectionsTable.uuid, sharedCollectionUuid),
        eq(sharedCollectionsTable.profile_uuid, profileUuid)
      ),
    });
    if (!sharedCollection) {
      return {
        success: false,
        error: 'Shared collection not found or you do not have permission to unshare it'
      };
    }
    await db.delete(sharedCollectionsTable)
      .where(eq(sharedCollectionsTable.uuid, sharedCollectionUuid));
    await logAuditEvent({ profileUuid, type: 'PROFILE', action: 'UNSHARE_COLLECTION', metadata: { shared_collection_uuid: sharedCollectionUuid } });
    // Revalidate paths
    return { success: true };
    });
  } catch (error) {
    rethrowIfRedirect(error);
    console.error('Error unsharing collection:', error);
    return {
      success: false,
      error: 'An error occurred while unsharing the collection'
    };
  }
}

/**
 * Share an embedded chat to the user's profile
 * @param profileUuid The UUID of the profile sharing the chat
 * @param title The title for the shared chat
 * @param description The description for the shared chat
 * @param settings Settings for the embedded chat (model, temperature, etc.)
 * @param isPublic Whether the shared chat should be public
 * @returns Success status and shared chat info if successful
 */
// Note: Sharing is still tied to profiles in this refactor. Adjust if needed.
export async function shareEmbeddedChat(
  profileUuid: string,
  title: string,
  description: string | undefined,
  settings: any,
  isPublic: boolean = true
): Promise<{ success: boolean; embeddedChat?: EmbeddedChat; error?: string }> {
  try {
    // profileUuid arrives from the client; verify the session owns it before
    // writing anything under it (same pattern as unshareServer above).
    return await withProfileAuth(uuidSchema.parse(profileUuid), async () => {
    const [embeddedChat] = await db.insert(embeddedChatsTable)
      .values({ profile_uuid: profileUuid, title, description, settings, is_public: isPublic, is_active: true })
      .returning();
    await logAuditEvent({ profileUuid, type: 'PROFILE', action: 'SHARE_EMBEDDED_CHAT', metadata: { title } });
    // Revalidate paths
    return {
      success: true,
      embeddedChat: embeddedChat as unknown as EmbeddedChat
    };
    });
  } catch (error) {
    rethrowIfRedirect(error);
    console.error('Error sharing embedded chat:', error);
    return {
      success: false,
      error: 'An error occurred while sharing the chat'
    };
  }
}

/**
 * Update an embedded chat
 * @param profileUuid The UUID of the profile that owns the chat
 * @param embeddedChatUuid The UUID of the embedded chat to update
 * @param updates The updates to apply (title, description, settings, isPublic, isActive)
 * @returns Success status and updated embedded chat info if successful
 */
// Note: Sharing is still tied to profiles in this refactor. Adjust if needed.
export async function updateEmbeddedChat(
  profileUuid: string,
  embeddedChatUuid: string,
  updates: {
    title?: string;
    description?: string;
    settings?: any;
    isPublic?: boolean;
    isActive?: boolean;
  }
): Promise<{ success: boolean; embeddedChat?: EmbeddedChat; error?: string }> {
  try {
    // profileUuid arrives from the client; verify the session owns it before
    // writing anything under it (same pattern as unshareServer above).
    return await withProfileAuth(uuidSchema.parse(profileUuid), async () => {
    const existingChat = await db.query.embeddedChatsTable.findFirst({
      where: and(
        eq(embeddedChatsTable.uuid, embeddedChatUuid),
        eq(embeddedChatsTable.profile_uuid, profileUuid)
      ),
    });
    if (!existingChat) {
      return {
        success: false,
        error: 'Embedded chat not found or you do not have permission to update it'
      };
    }
    const updateData: any = { updated_at: new Date() };
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.settings !== undefined) updateData.settings = updates.settings;
    if (updates.isPublic !== undefined) updateData.is_public = updates.isPublic;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
    const [updatedChat] = await db.update(embeddedChatsTable)
      .set(updateData)
      .where(eq(embeddedChatsTable.uuid, embeddedChatUuid))
      .returning();
    await logAuditEvent({ profileUuid, type: 'PROFILE', action: 'UPDATE_EMBEDDED_CHAT', metadata: { embedded_chat_uuid: embeddedChatUuid } });
    // Revalidate paths
    return {
      success: true,
      embeddedChat: updatedChat as unknown as EmbeddedChat
    };
    });
  } catch (error) {
    rethrowIfRedirect(error);
    console.error('Error updating embedded chat:', error);
    return {
      success: false,
      error: 'An error occurred while updating the embedded chat'
    };
  }
}

/**
 * Get an embedded chat by its UUID
 * @param embeddedChatUuid The UUID of the embedded chat
 * @returns The embedded chat or null if not found
 */
// Note: Sharing is still tied to profiles in this refactor. Adjust if needed.
export async function getEmbeddedChat(embeddedChatUuid: string): Promise<EmbeddedChat | null> {
  try {
    const embeddedChat = await db.query.embeddedChatsTable.findFirst({
      where: eq(embeddedChatsTable.uuid, embeddedChatUuid),
      with: {
        profile: true, // Keep profile relation if needed elsewhere
      },
    });
    return embeddedChat as unknown as EmbeddedChat;
  } catch (error) {
    console.error('Error getting embedded chat:', error);
    return null;
  }
}

/**
 * Delete an embedded chat
 * @param profileUuid The UUID of the profile
 * @param embeddedChatUuid The UUID of the embedded chat
 * @returns Success status and error message if applicable
 */
// Note: Sharing is still tied to profiles in this refactor. Adjust if needed.
/**
 * Check if an MCP server is already shared by a profile
 * @param profileUuid The UUID of the profile
 * @param serverUuid The UUID of the MCP server
 * @returns Whether the server is shared and details about the shared server
 */
// Note: Sharing is still tied to profiles in this refactor. Adjust if needed.
export async function isServerShared(
  profileUuid: string,
  serverUuid: string
): Promise<{ isShared: boolean; server?: SharedMcpServer }> {
  try {
    // Only the profile owner asks this question - it drives their own share
    // dialog - and the answer must never carry the stored template, which can
    // hold the server's connection details.
    if (!(await viewerOwnsProfile(profileUuid))) {
      return { isShared: false };
    }

    const sharedServer = await db.query.sharedMcpServersTable.findFirst({
      where: and(
        eq(sharedMcpServersTable.profile_uuid, profileUuid),
        eq(sharedMcpServersTable.server_uuid, serverUuid)
      )
    });
    if (sharedServer) {
      return {
        isShared: true,
        server: {
          uuid: sharedServer.uuid,
          profile_uuid: sharedServer.profile_uuid,
          server_uuid: sharedServer.server_uuid,
          title: sharedServer.title,
          description: sharedServer.description,
          is_public: sharedServer.is_public,
          created_at: sharedServer.created_at,
          updated_at: sharedServer.updated_at,
        } as unknown as SharedMcpServer
      };
    }
    return { isShared: false };
  } catch (error) {
    console.error('Error checking if server is shared:', error);
    return { isShared: false };
  }
}
