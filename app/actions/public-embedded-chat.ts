'use server';

import { db } from '@/db';
import { 
  embeddedChatsTable, 
  projectsTable,
  users 
} from '@/db/schema';
import { eq, and } from 'drizzle-orm';

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