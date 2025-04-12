'use server';

import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { logAuditEvent } from '@/app/actions/audit-logger';
import { createShareableTemplate } from '@/app/actions/mcp-servers';
import { db } from '@/db';
import { embeddedChatsTable, followersTable, mcpServersTable,profilesTable, projectsTable, sharedCollectionsTable, sharedMcpServersTable, users } from '@/db/schema';
import { Profile } from '@/types/profile';
import { EmbeddedChat, SharedCollection, SharedMcpServer, UsernameAvailability } from '@/types/social';

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
        message: validationResult.error.errors[0].message
      };
    }
    // Check if username exists in the users table
    const existingUser = await db.query.users.findFirst({
      where: eq(users.username, username),
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
export async function reserveUsername(userId: string, username: string): Promise<{ success: boolean; user?: typeof users.$inferSelect; error?: string }> {
  try {
    // First verify the user exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!existingUser) {
      console.error(`User not found with ID: ${userId}`);
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
        console.error(`Failed to update username for user ${userId}`);
        return {
          success: false,
          error: 'Failed to update username'
        };
      }

      // Log the action - Fetch profileUuid associated with userId for logging context
      const project = await db.query.projectsTable.findFirst({ 
        where: eq(projectsTable.user_id, userId) 
      });
      const profile = project ? await db.query.profilesTable.findFirst({ 
        where: eq(profilesTable.project_uuid, project.uuid) 
      }) : null;

      await logAuditEvent({
        profileUuid: profile?.uuid,
        type: 'PROFILE',
        action: 'RESERVE_USERNAME',
        metadata: { username, userId }, // Add userId to metadata for better tracking
      });

      // Revalidate paths
      revalidatePath('/settings');
      revalidatePath(`/to/${username}`);

      return {
        success: true,
        user: updatedUser
      };
    } catch (updateError) {
      console.error('Error updating username:', updateError);
      return {
        success: false,
        error: 'Database error while updating username'
      };
    }
  } catch (error) {
    console.error('Error in reserveUsername:', error);
    return {
      success: false,
      error: 'An unexpected error occurred while reserving the username'
    };
  }
}

// Helper function to get username for revalidation
async function getUsernameForProfile(profileUuid: string): Promise<string | null> {
   const profileData = await db.query.profilesTable.findFirst({
       where: eq(profilesTable.uuid, profileUuid),
       with: { project: { with: { user: { columns: { username: true } } } } }
   });
   return profileData?.project?.user?.username || null;
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
      type: 'PROFILE', // Use string literal
      action: 'UPDATE_PROFILE_SOCIAL',
      metadata: data,
    });
    // Revalidate paths
    revalidatePath('/settings');
    const associatedUsername = await getUsernameForProfile(profileUuid);
    if (associatedUsername) {
      revalidatePath(`/to/${associatedUsername}`);
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
 * Get a user and their profiles by username
 * @param username The username to look up
 * @returns The user data along with their public profiles
 */
export async function getProfileByUsername(username: string): Promise<{ 
  user: typeof users.$inferSelect, 
  profiles: Profile[] 
} | null> {
  try {
    // Get the user and their public profiles in a single query
    const userWithProfiles = await db
      .select({
        user: users,
        profile: {
          uuid: profilesTable.uuid,
          name: profilesTable.name,
          project_uuid: profilesTable.project_uuid,
          created_at: profilesTable.created_at,
          language: profilesTable.language,
          enabled_capabilities: profilesTable.enabled_capabilities,
          bio: profilesTable.bio,
          is_public: profilesTable.is_public,
          avatar_url: profilesTable.avatar_url,
        }
      })
      .from(users)
      .leftJoin(projectsTable, eq(users.id, projectsTable.user_id))
      .leftJoin(profilesTable, and(
        eq(projectsTable.uuid, profilesTable.project_uuid),
        eq(profilesTable.is_public, true)
      ))
      .where(eq(users.username, username));

    if (!userWithProfiles.length) {
      return null;
    }

    // Extract user and profiles
    const user = userWithProfiles[0].user;
    const profiles = userWithProfiles
      .map(row => row.profile)
      .filter((profile): profile is NonNullable<typeof profile> => 
        profile !== null && profile.is_public === true
      ) as Profile[];

    // Only return data if there are public profiles
    if (profiles.length === 0) {
      return null;
    }

    return {
      user,
      profiles
    };
  } catch (error) {
    console.error('Error getting user by username:', error);
    return null;
  }
}

/**
 * Search for profiles by username
 * @param query The search query
 * @param limit The maximum number of results to return
 * @returns An array of matching public user profiles (returning user data now)
 */
export async function searchProfiles(query: string, limit: number = 10): Promise<Array<typeof users.$inferSelect & { profile: Profile | null }>> {
  try {
    // Search users by username, join with profiles to check is_public and get profile data
    const results = await db
      .select({
        user: users,
        profile: {
          uuid: profilesTable.uuid,
          name: profilesTable.name,
          project_uuid: profilesTable.project_uuid,
          created_at: profilesTable.created_at,
          language: profilesTable.language,
          enabled_capabilities: profilesTable.enabled_capabilities,
          bio: profilesTable.bio,
          is_public: profilesTable.is_public,
          avatar_url: profilesTable.avatar_url,
        }
      })
      .from(users)
      .leftJoin(projectsTable, eq(users.id, projectsTable.user_id))
      .leftJoin(profilesTable, and(
        eq(projectsTable.uuid, profilesTable.project_uuid),
        eq(profilesTable.is_public, true) // Only join public profiles
      ))
      .where(
        ilike(users.username, `%${query}%`) // Search only username on users table
      )
      .limit(limit);

    // Filter out users without public profiles
    return results
      .filter(r => r.profile !== null && r.profile.is_public === true)
      .map(r => ({
        ...r.user,
        profile: r.profile as Profile | null
      }));
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
    const existingFollow = await db.query.followersTable.findFirst({
      where: and(
        eq(followersTable.follower_profile_uuid, followerUuid),
        eq(followersTable.followed_profile_uuid, followedUuid)
      ),
    });
    if (existingFollow) {
      return { success: false, error: 'Already following this profile' };
    }
    await db.insert(followersTable).values({
      follower_profile_uuid: followerUuid,
      followed_profile_uuid: followedUuid,
    });
    await logAuditEvent({
      profileUuid: followerUuid,
      type: 'PROFILE', // Use string literal
      action: 'FOLLOW_PROFILE',
      metadata: { followed_profile_uuid: followedUuid },
    });
    revalidatePath('/profile'); // Consider revalidating follower/following pages too
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
    await db
      .delete(followersTable)
      .where(
        and(
          eq(followersTable.follower_profile_uuid, followerUuid),
          eq(followersTable.followed_profile_uuid, followedUuid)
        )
      );
    await logAuditEvent({
      profileUuid: followerUuid,
      type: 'PROFILE', // Use string literal
      action: 'UNFOLLOW_PROFILE',
      metadata: { followed_profile_uuid: followedUuid },
    });
    revalidatePath('/profile'); // Consider revalidating follower/following pages too
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
    const server = await db.query.mcpServersTable.findFirst({
      where: eq(mcpServersTable.uuid, serverUuid),
    });
    if (!server) {
      return { success: false, error: 'Server not found' };
    }
    const serverTemplate = customTemplate || await createShareableTemplate(server);
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
    if (isPublic) {
       const associatedUsername = await getUsernameForProfile(profileUuid);
       if (associatedUsername) {
         revalidatePath(`/to/${associatedUsername}`);
       }
    }
    return {
      success: true,
      sharedServer: finalSharedServer as unknown as SharedMcpServer
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
 * Get a single shared MCP server
 * @param sharedServerUuid UUID of the shared server to get
 * @returns The shared server (including its server data) or null if not found
 */
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
                user: { // Select necessary user fields
                  columns: { username: true, email: true, name: true }
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

    // Determine the display name
    const user = sharedServerData.profile?.project?.user;
    const profile = sharedServerData.profile;
    const sharedByName = user?.username || user?.email || profile?.name || 'Unknown User';

    // Construct the final object without nested profile/project/user
    const result = {
      uuid: sharedServerData.uuid,
      profile_uuid: sharedServerData.profile_uuid,
      server_uuid: sharedServerData.server_uuid,
      title: sharedServerData.title,
      description: sharedServerData.description,
      is_public: sharedServerData.is_public,
      template: sharedServerData.template,
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
    await db.delete(sharedMcpServersTable)
      .where(eq(sharedMcpServersTable.uuid, sharedServerUuid));
    await logAuditEvent({
      profileUuid,
      type: 'PROFILE', // Use string literal
      action: 'UNSHARE_SERVER',
      metadata: { shared_server_uuid: sharedServerUuid },
    });
    // Revalidate paths
    const associatedUsername = await getUsernameForProfile(profileUuid);
    if (associatedUsername) {
      revalidatePath(`/to/${associatedUsername}`);
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
    const [sharedCollection] = await db.insert(sharedCollectionsTable)
      .values({ profile_uuid: profileUuid, title, description, content, is_public: isPublic })
      .returning();
    await logAuditEvent({ profileUuid, type: 'PROFILE', action: 'SHARE_COLLECTION', metadata: { title } });
    // Revalidate paths
    if (isPublic) {
       const associatedUsername = await getUsernameForProfile(profileUuid);
       if (associatedUsername) {
         revalidatePath(`/to/${associatedUsername}`);
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
    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.isPublic !== undefined) updateData.is_public = updates.isPublic;
    const [updatedCollection] = await db.update(sharedCollectionsTable)
      .set(updateData)
      .where(eq(sharedCollectionsTable.uuid, sharedCollectionUuid))
      .returning();
    await logAuditEvent({ profileUuid, type: 'PROFILE', action: 'UPDATE_SHARED_COLLECTION', metadata: { collection_uuid: sharedCollectionUuid } });
    // Revalidate paths
    const associatedUsername = await getUsernameForProfile(profileUuid);
    if (associatedUsername) {
      revalidatePath(`/to/${associatedUsername}`);
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
        profile: true, // Keep profile relation if needed elsewhere
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
    const associatedUsername = await getUsernameForProfile(profileUuid);
    if (associatedUsername) {
      revalidatePath(`/to/${associatedUsername}`);
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
    const [embeddedChat] = await db.insert(embeddedChatsTable)
      .values({ profile_uuid: profileUuid, title, description, settings, is_public: isPublic, is_active: true })
      .returning();
    await logAuditEvent({ profileUuid, type: 'PROFILE', action: 'SHARE_EMBEDDED_CHAT', metadata: { title } });
    // Revalidate paths
    if (isPublic) {
       const associatedUsername = await getUsernameForProfile(profileUuid);
       if (associatedUsername) {
         revalidatePath(`/to/${associatedUsername}`);
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
    const associatedUsername = await getUsernameForProfile(profileUuid);
    if (associatedUsername) {
      revalidatePath(`/to/${associatedUsername}`);
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
export async function deleteEmbeddedChat(
  profileUuid: string,
  embeddedChatUuid: string
): Promise<{ success: boolean; error?: string }> {
  try {
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
    await db.delete(embeddedChatsTable)
      .where(eq(embeddedChatsTable.uuid, embeddedChatUuid));
    await logAuditEvent({ profileUuid, type: 'PROFILE', action: 'DELETE_EMBEDDED_CHAT', metadata: { embedded_chat_uuid: embeddedChatUuid } });
    // Revalidate paths
    const associatedUsername = await getUsernameForProfile(profileUuid);
    if (associatedUsername) {
      revalidatePath(`/to/${associatedUsername}`);
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
