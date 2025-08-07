'use server';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { 
  chatConversationsTable,
  chatUsageTable,
  embeddedChatsTable, 
  projectsTable,
  users} from '@/db/schema';

export async function getUserPublicEmbeddedChat(userId: string) {
  try {
    // Get user's project with embedded chat enabled and public
    const result = await db
      .select({
        chat: embeddedChatsTable,
        project: projectsTable,
        user: {
          id: users.id,
          username: users.username,
          name: users.name,
          avatar_url: users.avatar_url,
        }
      })
      .from(users)
      .innerJoin(projectsTable, eq(projectsTable.user_id, users.id))
      .innerJoin(embeddedChatsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .where(and(
        eq(users.id, userId),
        eq(projectsTable.embedded_chat_enabled, true),
        eq(embeddedChatsTable.is_public, true),
        eq(embeddedChatsTable.is_active, true)
      ))
      .limit(1);

    if (result.length === 0) {
      return { success: true, data: null };
    }

    const { chat, project, user } = result[0];
    
    // Return public-safe data
    return { 
      success: true, 
      data: {
        chatUuid: chat.uuid,
        chatName: chat.name,
        welcomeMessage: chat.welcome_message,
        themeConfig: chat.theme_config,
        position: chat.position,
        requireApiKey: chat.require_api_key,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          avatarUrl: user.avatar_url,
        },
        project: {
          uuid: project.uuid,
          name: project.name,
        }
      }
    };
  } catch (error) {
    console.error('Error fetching public embedded chat:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch embedded chat' 
    };
  }
}

export async function getUserPublicEmbeddedChatByUsername(username: string) {
  try {
    // First get the user
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    return getUserPublicEmbeddedChat(user.id);
  } catch (error) {
    console.error('Error fetching public embedded chat by username:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch embedded chat' 
    };
  }
}

export async function getAllUserPublicEmbeddedChats(userId: string) {
  try {
    // Get all user's projects with embedded chats enabled and public
    const results = await db
      .select({
        chat: embeddedChatsTable,
        project: {
          uuid: projectsTable.uuid,
          name: projectsTable.name,
        },
        user: {
          id: users.id,
          username: users.username,
          name: users.name,
          avatar_url: users.avatar_url,
        },
        // Aggregate stats from chat_usage table
        totalMessages: sql<number>`COALESCE(SUM(${chatUsageTable.messages}), 0)::int`,
        totalConversations: sql<number>`COALESCE(SUM(${chatUsageTable.conversations}), 0)::int`,
        // Get conversation count directly
        activeConversations: sql<number>`(
          SELECT COUNT(*)::int 
          FROM ${chatConversationsTable} 
          WHERE ${chatConversationsTable.embedded_chat_uuid} = ${embeddedChatsTable.uuid}
        )`
      })
      .from(users)
      .innerJoin(projectsTable, eq(projectsTable.user_id, users.id))
      .innerJoin(embeddedChatsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .leftJoin(chatUsageTable, eq(chatUsageTable.embedded_chat_uuid, embeddedChatsTable.uuid))
      .where(and(
        eq(users.id, userId),
        eq(projectsTable.embedded_chat_enabled, true),
        eq(embeddedChatsTable.is_public, true),
        eq(embeddedChatsTable.is_active, true)
      ))
      .groupBy(
        embeddedChatsTable.uuid,
        embeddedChatsTable.name,
        embeddedChatsTable.slug,
        embeddedChatsTable.description,
        embeddedChatsTable.welcome_message,
        embeddedChatsTable.require_api_key,
        embeddedChatsTable.theme_config,
        embeddedChatsTable.position,
        embeddedChatsTable.last_active_at,
        embeddedChatsTable.created_at,
        projectsTable.uuid,
        projectsTable.name,
        users.id,
        users.username,
        users.name,
        users.avatar_url
      )
      .orderBy(embeddedChatsTable.created_at);

    if (!results || results.length === 0) {
      return { success: true, data: [] };
    }

    // Transform the results to a cleaner format
    const embeddedChats = results.map(result => ({
      uuid: result.chat.uuid,
      name: result.chat.name,
      slug: result.chat.slug,
      description: result.chat.description,
      welcomeMessage: result.chat.welcome_message,
      requireApiKey: result.chat.require_api_key,
      themeConfig: result.chat.theme_config,
      position: result.chat.position,
      lastActiveAt: result.chat.last_active_at,
      createdAt: result.chat.created_at,
      // Add statistics
      stats: {
        totalMessages: Number(result.totalMessages) || 0,
        totalConversations: Number(result.totalConversations) || 0,
        activeConversations: Number(result.activeConversations) || 0
      },
      user: result.user,
      // We don't expose project details, just keep the UUID for internal use
      projectUuid: result.project.uuid
    }));

    return { 
      success: true, 
      data: embeddedChats
    };
  } catch (error) {
    console.error('Error fetching all public embedded chats:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch embedded chats' 
    };
  }
}

export async function getAllUserPublicEmbeddedChatsByUsername(username: string) {
  try {
    // First get the user
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    return getAllUserPublicEmbeddedChats(user.id);
  } catch (error) {
    console.error('Error fetching all public embedded chats by username:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch embedded chats' 
    };
  }
}