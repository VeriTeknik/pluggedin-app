'use server';

// Consolidated imports
import { and, eq } from 'drizzle-orm'; 
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { z } from 'zod';

import { logAuditEvent } from '@/app/actions/audit-logger';
import { createShareableTemplate } from '@/app/actions/mcp-servers';
import { db } from '@/db';
// Ensure languageEnum is imported correctly from schema
import { languageEnum, mcpServersTable, sharedCollectionsTable, sharedMcpServersTable, users } from '@/db/schema'; 
import { SharedCollection, SharedMcpServer } from '@/types/social';
// We'll likely need the User type more often
type User = typeof users.$inferSelect;
// Define the type for the language enum values explicitly
type LanguageCode = typeof languageEnum.enumValues[number]; 

import { getAuthSession } from '@/lib/auth';
import { userOwnsProfile } from '@/lib/auth/profile-ownership';
import { withAuth, withProfileAuth } from '@/lib/auth-helpers';
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
 * Helper function to check if a user owns a profile through the project relationship
 * @param userId The user ID to check
 * @param profileUuid The profile UUID to verify ownership of
 * @returns True if the user owns the profile, false otherwise
 */

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
