import { db } from '@/db';
import { embeddedChatsTable, projectsTable } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function getUserEmbeddedChatUuid(userId: string): Promise<string | null> {
  try {
    // Get the first active embedded chat for the user
    const result = await db
      .select({
        chatUuid: embeddedChatsTable.uuid,
        isEnabled: projectsTable.embedded_chat_enabled,
      })
      .from(projectsTable)
      .innerJoin(embeddedChatsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .where(and(
        eq(projectsTable.user_id, userId),
        eq(embeddedChatsTable.is_active, true)
      ))
      .limit(1);

    if (result.length > 0) {
      return result[0].chatUuid;
    }

    // If no active chat, get any chat
    const anyChat = await db
      .select({
        chatUuid: embeddedChatsTable.uuid,
      })
      .from(projectsTable)
      .innerJoin(embeddedChatsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .where(eq(projectsTable.user_id, userId))
      .limit(1);

    return anyChat.length > 0 ? anyChat[0].chatUuid : null;
  } catch (error) {
    console.error('Error getting embedded chat UUID:', error);
    return null;
  }
}

export function getEmbeddedChatUrl(chatUuid: string | null): string {
  if (!chatUuid) {
    return '/embedded-chat';
  }
  return `/embedded-chat/${chatUuid}`;
}