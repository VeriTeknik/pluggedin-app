'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq, ilike, sql, desc } from 'drizzle-orm';

import { db } from '@/db';
import { profilesTable, followersTable, sharedMcpServersTable, sharedCollectionsTable, embeddedChatsTable, mcpServersTable } from '@/db/schema';
import { Profile } from '@/types/profile';
import { Follower, SharedMcpServer, SharedCollection, EmbeddedChat, UsernameAvailability } from '@/types/social';
import { logAuditEvent } from './audit-logger';
import { createShareableTemplate } from './mcp-servers';

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
    // Validate username format
    const validationResult = usernameSchema.safeParse(username);
    
    if (!validationResult.success) {
      return { 
        available: false, 
        message: validationResult.error.errors[0].message 
      };
    }

    // Check if username exists in the database
    const existingProfile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.username, username),
    });

    return {
      available: !existingProfile,
      message: existingProfile ? 'Username is already taken' : undefined
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
 * Reserve a username for a profile
 * @param profileUuid The UUID of the profile to update
 * @param username The username to reserve
 * @returns The updated profile or error information
 */
export async function reserveUsername(profileUuid: string, username: string): Promise<{ success: boolean; profile?: Profile; error?: string }> {
  try {
    // Check username availability
    const availability = await checkUsernameAvailability(username);
    
    if (!availability.available) {
      return { 
        success: false, 
        error: availability.message || 'Username is not available' 
      };
    }

    // Update profile with the new username
    const [updatedProfile] = await db.update(profilesTable)
      .set({ username })
      .where(eq(profilesTable.uuid, profileUuid))
      .returning();

    if (!updatedProfile) {
      return { 
        success: false, 
        error: 'Profile not found or could not be updated' 
      };
    }

    // Log the action
    await logAuditEvent({
      profileUuid,
      type: 'PROFILE',
      action: 'RESERVE_USERNAME',
      metadata: { username },
    });

    // Revalidate paths to update UI
    revalidatePath('/settings');
    revalidatePath(`/to/${username}`);

    return { 
      success: true, 
      profile: updatedProfile as unknown as Profile 
    };
  } catch (error) {
    console.error('Error reserving username:', error);
    return { 
      success: false, 
      error: 'An error occurred while reserving the username' 
    };
  }
}

/**
 * Update profile social information
 * @param profileUuid The UUID of the profile to update
 * @param data The profile data to update
 * @returns The updated profile or error information
 */
export async function updateProfileSocial(
  profileUuid: string, 
  data: { 
    bio?: string; 
    is_public?: boolean; 
    avatar_url?: string;
  }
): Promise<{ success: boolean; profile?: Profile; error?: string }> {
  try {
    // Update profile with the social data
    const [updatedProfile] = await db.update(profilesTable)
      .set(data)
      .where(eq(profilesTable.uuid, profileUuid))
      .returning();

    if (!updatedProfile) {
      return { 
        success: false, 
        error: 'Profile not found or could not be updated' 
      };
    }

    // Log the action
    await logAuditEvent({
      profileUuid,
      type: 'PROFILE',
      action: 'UPDATE_PROFILE_SOCIAL',
      metadata: data,
    });

    // Revalidate paths to update UI
    revalidatePath('/settings');
    if (updatedProfile.username) {
      revalidatePath(`/to/${updatedProfile.username}`);
    }

    return { 
      success: true, 
      profile: updatedProfile as unknown as Profile 
    };
  } catch (error) {
    console.error('Error updating profile social data:', error);
    return { 
      success: false, 
      error: 'An error occurred while updating the profile' 
    };
  }
}

/**
 * Get a profile by username
 * @param username The username to look up
 * @returns The profile or null if not found
 */
export async function getProfileByUsername(username: string): Promise<Profile | null> {
  try {
    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.username, username),
    });

    return profile as unknown as Profile;
  } catch (error) {
    console.error('Error getting profile by username:', error);
    return null;
  }
}

/**
 * Search for profiles by username
 * @param query The search query
 * @param limit The maximum number of results to return
 * @returns An array of matching profiles
 */
export async function searchProfiles(query: string, limit: number = 10): Promise<Profile[]> {
  try {
    const profiles = await db.query.profilesTable.findMany({
      where: and(
        ilike(profilesTable.username, `%${query}%`),
        eq(profilesTable.is_public, true)
      ),
      limit,
    });

    return profiles as unknown as Profile[];
  } catch (error) {
    console.error('Error searching profiles:', error);
    return [];
  }
}

/**
 * Get the number of followers for a profile
 * @param profileUuid The UUID of the profile
 * @returns The follower count
 */
export async function getFollowerCount(profileUuid: string): Promise<number> {
  try {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(followersTable)
      .where(eq(followersTable.followed_profile_uuid, profileUuid));

    return result[0]?.count || 0;
  } catch (error) {
    console.error('Error getting follower count:', error);
    return 0;
  }
}

/**
 * Get the number of profiles a user is following
 * @param profileUuid The UUID of the profile
 * @returns The following count
 */
export async function getFollowingCount(profileUuid: string): Promise<number> {
  try {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(followersTable)
      .where(eq(followersTable.follower_profile_uuid, profileUuid));

    return result[0]?.count || 0;
  } catch (error) {
    console.error('Error getting following count:', error);
    return 0;
  }
}

/**
 * Follow a profile
 * @param followerUuid The UUID of the follower profile
 * @param followedUuid The UUID of the profile to follow
 * @returns Success status and error message if applicable
 */
export async function followProfile(
  followerUuid: string,
  followedUuid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if already following
    const existingFollow = await db.query.followersTable.findFirst({
      where: and(
        eq(followersTable.follower_profile_uuid, followerUuid),
        eq(followersTable.followed_profile_uuid, followedUuid)
      ),
    });

    if (existingFollow) {
      return { success: false, error: 'Already following this profile' };
    }

    // Create new follow relationship
    await db.insert(followersTable).values({
      follower_profile_uuid: followerUuid,
      followed_profile_uuid: followedUuid,
    });

    // Log the action
    await logAuditEvent({
      profileUuid: followerUuid,
      type: 'PROFILE',
      action: 'FOLLOW_PROFILE',
      metadata: { followed_profile_uuid: followedUuid },
    });

    // Revalidate paths
    revalidatePath('/profile');

    return { success: true };
  } catch (error) {
    console.error('Error following profile:', error);
    return { 
      success: false, 
      error: 'An error occurred while trying to follow the profile' 
    };
  }
}

/**
 * Unfollow a profile
 * @param followerUuid The UUID of the follower profile
 * @param followedUuid The UUID of the profile to unfollow
 * @returns Success status and error message if applicable
 */
export async function unfollowProfile(
  followerUuid: string,
  followedUuid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Delete follow relationship
    const result = await db
      .delete(followersTable)
      .where(
        and(
          eq(followersTable.follower_profile_uuid, followerUuid),
          eq(followersTable.followed_profile_uuid, followedUuid)
        )
      );

    // Log the action
    await logAuditEvent({
      profileUuid: followerUuid,
      type: 'PROFILE',
      action: 'UNFOLLOW_PROFILE',
      metadata: { followed_profile_uuid: followedUuid },
    });

    // Revalidate paths
    revalidatePath('/profile');

    return { success: true };
  } catch (error) {
    console.error('Error unfollowing profile:', error);
    return { 
      success: false, 
      error: 'An error occurred while trying to unfollow the profile' 
    };
  }
}

/**
 * Check if a profile is following another profile
 * @param followerUuid The UUID of the follower profile
 * @param followedUuid The UUID of the profile being followed
 * @returns True if following, false otherwise
 */
export async function isFollowing(
  followerUuid: string,
  followedUuid: string
): Promise<boolean> {
  try {
    const existingFollow = await db.query.followersTable.findFirst({
      where: and(
        eq(followersTable.follower_profile_uuid, followerUuid),
        eq(followersTable.followed_profile_uuid, followedUuid)
      ),
    });

    return !!existingFollow;
  } catch (error) {
    console.error('Error checking follow status:', error);
    return false;
  }
}

/**
 * Get shared MCP servers for a profile
 * @param profileUuid The UUID of the profile
 * @param limit The maximum number of results to return
 * @param includePrivate Whether to include private shared servers
 * @returns An array of shared MCP servers
 */
export async function getSharedMcpServers(
  profileUuid: string,
  limit: number = 10,
  includePrivate: boolean = false
): Promise<SharedMcpServer[]> {
  try {
    const whereClause = includePrivate 
      ? eq(sharedMcpServersTable.profile_uuid, profileUuid)
      : and(
          eq(sharedMcpServersTable.profile_uuid, profileUuid),
          eq(sharedMcpServersTable.is_public, true)
        );

    const sharedServers = await db.query.sharedMcpServersTable.findMany({
      where: whereClause,
      limit,
      with: {
        server: true,
      },
      orderBy: (servers) => [desc(servers.created_at)],
    });

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
export async function getSharedCollections(
  profileUuid: string,
  limit: number = 10,
  includePrivate: boolean = false
): Promise<SharedCollection[]> {
  try {
    const whereClause = includePrivate 
      ? eq(sharedCollectionsTable.profile_uuid, profileUuid)
      : and(
          eq(sharedCollectionsTable.profile_uuid, profileUuid),
          eq(sharedCollectionsTable.is_public, true)
        );

    const sharedCollections = await db.query.sharedCollectionsTable.findMany({
      where: whereClause,
      limit,
      orderBy: (collections) => [desc(collections.created_at)],
    });

    return sharedCollections as unknown as SharedCollection[];
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
export async function getEmbeddedChats(
  profileUuid: string,
  limit: number = 10,
  includePrivate: boolean = false
): Promise<EmbeddedChat[]> {
  try {
    const whereClause = includePrivate 
      ? and(
          eq(embeddedChatsTable.profile_uuid, profileUuid),
          eq(embeddedChatsTable.is_active, true)
        )
      : and(
          eq(embeddedChatsTable.profile_uuid, profileUuid),
          eq(embeddedChatsTable.is_public, true),
          eq(embeddedChatsTable.is_active, true)
        );

    const chats = await db.query.embeddedChatsTable.findMany({
      where: whereClause,
      limit,
      orderBy: (chats) => [desc(chats.created_at)],
    });

    return chats as unknown as EmbeddedChat[];
  } catch (error) {
    console.error('Error getting embedded chats:', error);
    return [];
  }
}

/**
 * Get followers for a profile
 * @param profileUuid The UUID of the profile
 * @param limit The maximum number of results to return
 * @returns An array of follower profiles
 */
export async function getFollowers(
  profileUuid: string,
  limit: number = 10
): Promise<Profile[]> {
  try {
    const followers = await db.query.followersTable.findMany({
      where: eq(followersTable.followed_profile_uuid, profileUuid),
      limit,
      with: {
        follower: true,
      },
      orderBy: (followers) => [desc(followers.created_at)],
    });

    return followers.map(f => f.follower) as unknown as Profile[];
  } catch (error) {
    console.error('Error getting followers:', error);
    return [];
  }
}

/**
 * Get profiles that a user is following
 * @param profileUuid The UUID of the profile
 * @param limit The maximum number of results to return
 * @returns An array of followed profiles
 */
export async function getFollowing(
  profileUuid: string,
  limit: number = 10
): Promise<Profile[]> {
  try {
    const following = await db.query.followersTable.findMany({
      where: eq(followersTable.follower_profile_uuid, profileUuid),
      limit,
      with: {
        followed: true,
      },
      orderBy: (following) => [desc(following.created_at)],
    });

    return following.map(f => f.followed) as unknown as Profile[];
  } catch (error) {
    console.error('Error getting following:', error);
    return [];
  }
}

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
export async function shareMcpServer(
  profileUuid: string,
  serverUuid: string,
  title: string,
  description?: string,
  isPublic: boolean = true,
  customTemplate?: any
): Promise<{ success: boolean; sharedServer?: SharedMcpServer; error?: string }> {
  try {
    // Check if the server exists and belongs to the profile
    const server = await db.query.mcpServersTable.findFirst({
      where: eq(mcpServersTable.uuid, serverUuid),
    });

    if (!server) {
      return { 
        success: false, 
        error: 'Server not found' 
      };
    }

    // Create a sanitized template of the server or use custom template if provided
    const serverTemplate = customTemplate || await createShareableTemplate(server);

    // Check if the server is already shared by this profile
    const existingShare = await db.query.sharedMcpServersTable.findFirst({
      where: and(
        eq(sharedMcpServersTable.profile_uuid, profileUuid),
        eq(sharedMcpServersTable.server_uuid, serverUuid)
      ),
    });

    if (existingShare) {
      // Update existing share
      const [updatedShare] = await db.update(sharedMcpServersTable)
        .set({ 
          title, 
          description, 
          is_public: isPublic,
          updated_at: new Date(),
          template: serverTemplate // Store sanitized or custom template
        })
        .where(eq(sharedMcpServersTable.uuid, existingShare.uuid))
        .returning();

      // Log the action
      await logAuditEvent({
        profileUuid,
        type: 'PROFILE',
        action: 'UPDATE_SHARED_SERVER',
        metadata: { server_uuid: serverUuid, title },
      });

      return { 
        success: true, 
        sharedServer: updatedShare as unknown as SharedMcpServer 
      };
    }

    // Create new shared server
    const [sharedServer] = await db.insert(sharedMcpServersTable)
      .values({
        profile_uuid: profileUuid,
        server_uuid: serverUuid,
        title,
        description,
        is_public: isPublic,
        template: serverTemplate // Store sanitized or custom template
      })
      .returning();

    // Log the action
    await logAuditEvent({
      profileUuid,
      type: 'PROFILE',
      action: 'SHARE_SERVER',
      metadata: { server_uuid: serverUuid, title },
    });

    // Revalidate paths
    if (isPublic) {
      const profile = await db.query.profilesTable.findFirst({
        where: eq(profilesTable.uuid, profileUuid),
      });
      
      if (profile?.username) {
        revalidatePath(`/to/${profile.username}`);
      }
    }

    return { 
      success: true, 
      sharedServer: sharedServer as unknown as SharedMcpServer 
    };
  } catch (error) {
    console.error('Error sharing MCP server:', error);
    return { 
      success: false, 
      error: 'An error occurred while sharing the server' 
    };
  }
}

/**
 * Get a shared MCP server by its UUID
 * @param sharedServerUuid The UUID of the shared server
 * @returns The shared server or null if not found
 */
export async function getSharedMcpServer(sharedServerUuid: string): Promise<SharedMcpServer | null> {
  try {
    const sharedServer = await db.query.sharedMcpServersTable.findFirst({
      where: eq(sharedMcpServersTable.uuid, sharedServerUuid),
      with: {
        server: true,
        profile: true,
      },
    });

    return sharedServer as unknown as SharedMcpServer;
  } catch (error) {
    console.error('Error getting shared MCP server:', error);
    return null;
  }
}

/**
 * Unshare an MCP server from a profile
 * @param profileUuid The UUID of the profile
 * @param sharedServerUuid The UUID of the shared server
 * @returns Success status and error message if applicable
 */
export async function unshareServer(
  profileUuid: string,
  sharedServerUuid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if the shared server exists and belongs to the profile
    const sharedServer = await db.query.sharedMcpServersTable.findFirst({
      where: and(
        eq(sharedMcpServersTable.uuid, sharedServerUuid),
        eq(sharedMcpServersTable.profile_uuid, profileUuid)
      ),
    });

    if (!sharedServer) {
      return { 
        success: false, 
        error: 'Shared server not found or you do not have permission to unshare it' 
      };
    }

    // Delete the shared server
    await db.delete(sharedMcpServersTable)
      .where(eq(sharedMcpServersTable.uuid, sharedServerUuid));

    // Log the action
    await logAuditEvent({
      profileUuid,
      type: 'PROFILE',
      action: 'UNSHARE_SERVER',
      metadata: { shared_server_uuid: sharedServerUuid },
    });

    // Revalidate paths
    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.uuid, profileUuid),
    });
    
    if (profile?.username) {
      revalidatePath(`/to/${profile.username}`);
    }

    return { success: true };
  } catch (error) {
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
export async function shareCollection(
  profileUuid: string,
  title: string,
  description: string | undefined,
  content: any,
  isPublic: boolean = true
): Promise<{ success: boolean; sharedCollection?: SharedCollection; error?: string }> {
  try {
    // Create new shared collection
    const [sharedCollection] = await db.insert(sharedCollectionsTable)
      .values({
        profile_uuid: profileUuid,
        title,
        description,
        content, // Content is a jsonb field
        is_public: isPublic,
      })
      .returning();

    // Log the action
    await logAuditEvent({
      profileUuid,
      type: 'PROFILE',
      action: 'SHARE_COLLECTION',
      metadata: { title },
    });

    // Revalidate paths
    if (isPublic) {
      const profile = await db.query.profilesTable.findFirst({
        where: eq(profilesTable.uuid, profileUuid),
      });
      
      if (profile?.username) {
        revalidatePath(`/to/${profile.username}`);
      }
    }

    return { 
      success: true, 
      sharedCollection: sharedCollection as unknown as SharedCollection 
    };
  } catch (error) {
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
    // Check if the shared collection exists and belongs to the profile
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

    // Prepare update data
    const updateData: any = {
      updated_at: new Date(),
    };
    
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.isPublic !== undefined) updateData.is_public = updates.isPublic;

    // Update the shared collection
    const [updatedCollection] = await db.update(sharedCollectionsTable)
      .set(updateData)
      .where(eq(sharedCollectionsTable.uuid, sharedCollectionUuid))
      .returning();

    // Log the action
    await logAuditEvent({
      profileUuid,
      type: 'PROFILE',
      action: 'UPDATE_SHARED_COLLECTION',
      metadata: { collection_uuid: sharedCollectionUuid },
    });

    // Revalidate paths
    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.uuid, profileUuid),
    });
    
    if (profile?.username) {
      revalidatePath(`/to/${profile.username}`);
    }

    return { 
      success: true, 
      sharedCollection: updatedCollection as unknown as SharedCollection 
    };
  } catch (error) {
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
    const sharedCollection = await db.query.sharedCollectionsTable.findFirst({
      where: eq(sharedCollectionsTable.uuid, sharedCollectionUuid),
      with: {
        profile: true,
      },
    });

    return sharedCollection as unknown as SharedCollection;
  } catch (error) {
    console.error('Error getting shared collection:', error);
    return null;
  }
}

/**
 * Unshare a collection from a profile
 * @param profileUuid The UUID of the profile
 * @param sharedCollectionUuid The UUID of the shared collection
 * @returns Success status and error message if applicable
 */
export async function unshareCollection(
  profileUuid: string,
  sharedCollectionUuid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if the shared collection exists and belongs to the profile
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

    // Delete the shared collection
    await db.delete(sharedCollectionsTable)
      .where(eq(sharedCollectionsTable.uuid, sharedCollectionUuid));

    // Log the action
    await logAuditEvent({
      profileUuid,
      type: 'PROFILE',
      action: 'UNSHARE_COLLECTION',
      metadata: { shared_collection_uuid: sharedCollectionUuid },
    });

    // Revalidate paths
    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.uuid, profileUuid),
    });
    
    if (profile?.username) {
      revalidatePath(`/to/${profile.username}`);
    }

    return { success: true };
  } catch (error) {
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
export async function shareEmbeddedChat(
  profileUuid: string,
  title: string,
  description: string | undefined,
  settings: any,
  isPublic: boolean = true
): Promise<{ success: boolean; embeddedChat?: EmbeddedChat; error?: string }> {
  try {
    // Create new embedded chat
    const [embeddedChat] = await db.insert(embeddedChatsTable)
      .values({
        profile_uuid: profileUuid,
        title,
        description,
        settings, // Settings is a jsonb field
        is_public: isPublic,
        is_active: true,
      })
      .returning();

    // Log the action
    await logAuditEvent({
      profileUuid,
      type: 'PROFILE',
      action: 'SHARE_EMBEDDED_CHAT',
      metadata: { title },
    });

    // Revalidate paths
    if (isPublic) {
      const profile = await db.query.profilesTable.findFirst({
        where: eq(profilesTable.uuid, profileUuid),
      });
      
      if (profile?.username) {
        revalidatePath(`/to/${profile.username}`);
      }
    }

    return { 
      success: true, 
      embeddedChat: embeddedChat as unknown as EmbeddedChat 
    };
  } catch (error) {
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
    // Check if the embedded chat exists and belongs to the profile
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

    // Prepare update data
    const updateData: any = {
      updated_at: new Date(),
    };
    
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.settings !== undefined) updateData.settings = updates.settings;
    if (updates.isPublic !== undefined) updateData.is_public = updates.isPublic;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

    // Update the embedded chat
    const [updatedChat] = await db.update(embeddedChatsTable)
      .set(updateData)
      .where(eq(embeddedChatsTable.uuid, embeddedChatUuid))
      .returning();

    // Log the action
    await logAuditEvent({
      profileUuid,
      type: 'PROFILE',
      action: 'UPDATE_EMBEDDED_CHAT',
      metadata: { embedded_chat_uuid: embeddedChatUuid },
    });

    // Revalidate paths
    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.uuid, profileUuid),
    });
    
    if (profile?.username) {
      revalidatePath(`/to/${profile.username}`);
    }

    return { 
      success: true, 
      embeddedChat: updatedChat as unknown as EmbeddedChat 
    };
  } catch (error) {
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
export async function getEmbeddedChat(embeddedChatUuid: string): Promise<EmbeddedChat | null> {
  try {
    const embeddedChat = await db.query.embeddedChatsTable.findFirst({
      where: eq(embeddedChatsTable.uuid, embeddedChatUuid),
      with: {
        profile: true,
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
export async function deleteEmbeddedChat(
  profileUuid: string,
  embeddedChatUuid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if the embedded chat exists and belongs to the profile
    const embeddedChat = await db.query.embeddedChatsTable.findFirst({
      where: and(
        eq(embeddedChatsTable.uuid, embeddedChatUuid),
        eq(embeddedChatsTable.profile_uuid, profileUuid)
      ),
    });

    if (!embeddedChat) {
      return { 
        success: false, 
        error: 'Embedded chat not found or you do not have permission to delete it' 
      };
    }

    // Delete the embedded chat
    await db.delete(embeddedChatsTable)
      .where(eq(embeddedChatsTable.uuid, embeddedChatUuid));

    // Log the action
    await logAuditEvent({
      profileUuid,
      type: 'PROFILE',
      action: 'DELETE_EMBEDDED_CHAT',
      metadata: { embedded_chat_uuid: embeddedChatUuid },
    });

    // Revalidate paths
    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.uuid, profileUuid),
    });
    
    if (profile?.username) {
      revalidatePath(`/to/${profile.username}`);
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting embedded chat:', error);
    return { 
      success: false, 
      error: 'An error occurred while deleting the embedded chat' 
    };
  }
}

/**
 * Check if an MCP server is already shared by a profile
 * @param profileUuid The UUID of the profile
 * @param serverUuid The UUID of the MCP server
 * @returns Whether the server is shared and details about the shared server
 */
export async function isServerShared(
  profileUuid: string,
  serverUuid: string
): Promise<{ isShared: boolean; server?: SharedMcpServer }> {
  try {
    const sharedServer = await db.query.sharedMcpServersTable.findFirst({
      where: and(
        eq(sharedMcpServersTable.profile_uuid, profileUuid),
        eq(sharedMcpServersTable.server_uuid, serverUuid)
      )
    });

    if (sharedServer) {
      return { 
        isShared: true, 
        server: sharedServer as unknown as SharedMcpServer 
      };
    }

    return { isShared: false };
  } catch (error) {
    console.error('Error checking if server is shared:', error);
    return { isShared: false };
  }
} 