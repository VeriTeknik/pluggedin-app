'use server';

// Consolidated imports
import { and, desc, eq, ilike, sql } from 'drizzle-orm'; 
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { logAuditEvent } from '@/app/actions/audit-logger';
import { createShareableTemplate } from '@/app/actions/mcp-servers';
import { db } from '@/db';
// Ensure languageEnum is imported correctly from schema
import { embeddedChatsTable, followersTable, languageEnum, mcpServersTable, profilesTable, projectsTable, sharedCollectionsTable, sharedMcpServersTable, users } from '@/db/schema'; 
import { EmbeddedChat, SharedCollection, SharedMcpServer, UsernameAvailability } from '@/types/social';
// We'll likely need the User type more often
type User = typeof users.$inferSelect;
// Define the type for the language enum values explicitly
type LanguageCode = typeof languageEnum.enumValues[number]; 

import { getAuthSession } from '@/lib/auth';

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

// Helper function to get username for revalidation - May need adjustment based on profile role
async function getUsernameForProfile(profileUuid: string): Promise<string | null> {
   const profileData = await db.query.profilesTable.findFirst({
       where: eq(profilesTable.uuid, profileUuid),
       with: { project: { with: { user: { columns: { username: true } } } } }
   });
   return profileData?.project?.user?.username || null;
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
): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
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
      revalidatePath(`/to/${updatedUser.username}`);
    }
    
    return {
      success: true,
      user: updatedUser
    };
  } catch (error) {
    console.error('Error updating user social data:', error);
    return {
      success: false,
      error: 'An error occurred while updating the user'
    };
  }
}

/**
 * Get a user by username (formerly getProfileByUsername)
 * @param username The username to look up
 * @returns The user data if the user exists and visibility rules allow access
 */
export async function getUserByUsername(username: string): Promise<User | null> {
  try {
    // Get the session to check if the requester is authorized
    const session = await getAuthSession();
    const currentUserId = session?.user?.id;

    // First, get the user without any visibility filters
    const user = await db.query.users.findFirst({
      where: eq(users.username, username),
    });

    // If no user exists with this username, return null
    if (!user) {
      console.log(`No user found with username: ${username}`);
      return null;
    }

    // If the user exists, check visibility rules:
    // 1. The profile is public, OR
    // 2. The requester is the profile owner, OR
    // 3. The requester is authenticated
    if (user.is_public || currentUserId === user.id || currentUserId) {
      return user;
    }

    // If none of the visibility rules pass, return null
    console.log(`User ${username} found but not accessible due to visibility rules`);
    return null;
  } catch (error) {
    console.error('Error getting user by username:', error);
    return null;
  }
}

/**
 * Search for users by username (formerly searchProfiles)
 * @param query The search query
 * @param limit The maximum number of results to return
 * @returns An array of matching public users
 */
export async function searchUsers(query: string, limit: number = 10): Promise<User[]> {
  try {
    // Search users directly by username
    const results = await db
      .select()
      .from(users)
      .where(and(
        ilike(users.username, `%${query}%`), // Search username
        eq(users.is_public, true) // Only return public users
      ))
      .limit(limit);

    return results;
  } catch (error) {
    console.error('Error searching users:', error); // Corrected log message
    return [];
  }
}

/**
 * Get the number of followers for a user (formerly getFollowerCount)
 * @param userId The ID of the user
 * @returns The follower count
 */
export async function getUserFollowerCount(userId: string): Promise<number> {
  try {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(followersTable)
      .where(eq(followersTable.followed_user_id, userId)); // Use followed_user_id
    return result[0]?.count || 0;
  } catch (error) {
    console.error('Error getting follower count:', error);
    return 0;
  }
}

/**
 * Get the number of users a user is following (formerly getFollowingCount)
 * @param userId The ID of the user
 * @returns The following count
 */
export async function getUserFollowingCount(userId: string): Promise<number> {
  try {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(followersTable)
      .where(eq(followersTable.follower_user_id, userId)); // Use follower_user_id
    return result[0]?.count || 0;
  } catch (error) {
    console.error('Error getting following count:', error);
    return 0;
  }
}

/**
 * Follow a user (formerly followProfile)
 * @param followerUserId The ID of the follower user
 * @param followedUserId The ID of the user to follow
 * @returns Success status and error message if applicable
 */
export async function followUser(
  followerUserId: string,
  followedUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if users exist (optional but good practice)
    const followerExists = await db.query.users.findFirst({ where: eq(users.id, followerUserId) });
    const followedExists = await db.query.users.findFirst({ where: eq(users.id, followedUserId) });
    if (!followerExists || !followedExists) {
      return { success: false, error: 'User not found' };
    }
    if (followerUserId === followedUserId) {
       return { success: false, error: 'Cannot follow yourself' };
    }

    const existingFollow = await db.query.followersTable.findFirst({
      where: and(
        eq(followersTable.follower_user_id, followerUserId), // Use user IDs
        eq(followersTable.followed_user_id, followedUserId)  // Use user IDs
      ),
    });
    if (existingFollow) {
      return { success: false, error: 'Already following this user' };
    }
    await db.insert(followersTable).values({
      follower_user_id: followerUserId, // Use user IDs
      followed_user_id: followedUserId, // Use user IDs
    });
    // Update logging if needed (log against user ID)
    // await logAuditEvent({ userId: followerUserId, type: 'USER', action: 'FOLLOW_USER', metadata: { followedUserId } });
    // Revalidate relevant user pages
    const followerUsername = followerExists.username;
    const followedUsername = followedExists.username;
    if (followerUsername) revalidatePath(`/to/${followerUsername}`);
    if (followedUsername) revalidatePath(`/to/${followedUsername}`);
    return { success: true };
  } catch (error) {
    console.error('Error following user:', error); // Corrected log message
    return {
      success: false,
      error: 'An error occurred while trying to follow the user' // Corrected error message
    };
  }
}

/**
 * Unfollow a user (formerly unfollowProfile)
 * @param followerUserId The ID of the follower user
 * @param followedUserId The ID of the user to unfollow
 * @returns Success status and error message if applicable
 */
export async function unfollowUser(
  followerUserId: string,
  followedUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const deleted = await db
      .delete(followersTable)
      .where(
        and(
          eq(followersTable.follower_user_id, followerUserId), // Use user IDs
          eq(followersTable.followed_user_id, followedUserId)  // Use user IDs
        )
      )
      .returning(); // Check if a row was actually deleted

    if (deleted.length === 0) {
       // Optional: return error if they weren't following in the first place
       // return { success: false, error: 'Not following this user' };
    }
    
    // Update logging if needed
    // await logAuditEvent({ userId: followerUserId, type: 'USER', action: 'UNFOLLOW_USER', metadata: { followedUserId } });
    // Revalidate relevant user pages
    const followerUser = await db.query.users.findFirst({ where: eq(users.id, followerUserId), columns: { username: true } });
    const followedUser = await db.query.users.findFirst({ where: eq(users.id, followedUserId), columns: { username: true } });
    if (followerUser?.username) revalidatePath(`/to/${followerUser.username}`);
    if (followedUser?.username) revalidatePath(`/to/${followedUser.username}`);
    return { success: true };
  } catch (error) {
    console.error('Error unfollowing user:', error); // Corrected log message
    return {
      success: false,
      error: 'An error occurred while trying to unfollow the user' // Corrected error message
    };
  }
}

/**
 * Check if a user is following another user (formerly isFollowing)
 * @param followerUserId The ID of the follower user
 * @param followedUserId The ID of the user being followed
 * @returns True if following, false otherwise
 */
export async function isFollowingUser(
  followerUserId: string,
  followedUserId: string
): Promise<boolean> {
   if (followerUserId === followedUserId) return false; // Cannot follow self
  try {
    const existingFollow = await db.query.followersTable.findFirst({
      where: and(
        eq(followersTable.follower_user_id, followerUserId), // Use user IDs
        eq(followersTable.followed_user_id, followedUserId)  // Use user IDs
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
// Note: Sharing is still tied to profiles in this refactor. Adjust if needed.
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
    const whereClause = includePrivate
      ? eq(sharedCollectionsTable.profile_uuid, profileUuid)
      : and(
          eq(sharedCollectionsTable.profile_uuid, profileUuid),
          eq(sharedCollectionsTable.is_public, true)
        );
    const sharedCollections = await db.query.sharedCollectionsTable.findMany({
      where: whereClause,
      limit,
      orderBy: (collections: any) => [desc(collections.created_at)], // Added explicit type
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
// Note: Sharing is still tied to profiles in this refactor. Adjust if needed.
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
      orderBy: (chats: any) => [desc(chats.created_at)], // Added explicit type
    });
    return chats as unknown as EmbeddedChat[];
  } catch (error) {
    console.error('Error getting embedded chats:', error);
    return [];
  }
}

/**
 * Get followers for a user (formerly getFollowers)
 * @param userId The ID of the user
 * @param limit The maximum number of results to return
 * @returns An array of follower users
 */
export async function getFollowers(
  userId: string,
  limit: number = 10
): Promise<User[]> {
  try {
    const followersData = await db
      .select({ followerUser: users }) // Select the user data directly
      .from(followersTable)
      .innerJoin(users, eq(followersTable.follower_user_id, users.id)) // Join users table
      .where(eq(followersTable.followed_user_id, userId)) // Filter by followed user
      .orderBy(desc(followersTable.created_at))
      .limit(limit);

    return followersData.map((f: { followerUser: User }) => f.followerUser); // Added explicit type
  } catch (error) {
    console.error('Error getting followers:', error);
    return [];
  }
}

/**
 * Get users that a user is following (formerly getFollowing)
 * @param userId The ID of the user
 * @param limit The maximum number of results to return
 * @returns An array of followed users
 */
export async function getFollowing(
  userId: string,
  limit: number = 10
): Promise<User[]> { // Return User array
  try {
    // Explicitly join followersTable with users table
    const followingData = await db
      .select({ followedUser: users }) // Select the user data directly
      .from(followersTable)
      .innerJoin(users, eq(followersTable.followed_user_id, users.id)) // Join users table
      .where(eq(followersTable.follower_user_id, userId)) // Filter by the follower user
      .orderBy(desc(followersTable.created_at)) // Order by follow date
      .limit(limit);

    return followingData.map((f: { followedUser: User }) => f.followedUser); // Added explicit type
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
// Note: Sharing is still tied to profiles in this refactor. Adjust if needed.
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
// Note: Sharing is still tied to profiles in this refactor. Adjust if needed.
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
// Note: Sharing is still tied to profiles in this refactor. Adjust if needed.
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
// Note: Sharing is still tied to profiles in this refactor. Adjust if needed.
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
// Note: Sharing is still tied to profiles in this refactor. Adjust if needed.
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
// Note: Sharing is still tied to profiles in this refactor. Adjust if needed.
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
