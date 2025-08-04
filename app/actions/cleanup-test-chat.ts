'use server';

import { db } from '@/db';
import { embeddedChatsTable } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getAuthSession } from '@/lib/auth';

export async function cleanupTestChat() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated' };
    }

    // Find and update any "Test AI Assistant" chats to not be public
    const testChats = await db
      .select()
      .from(embeddedChatsTable)
      .where(and(
        eq(embeddedChatsTable.name, 'Test AI Assistant'),
        eq(embeddedChatsTable.is_public, true)
      ));

    if (testChats.length > 0) {
      // Make all test chats private
      for (const chat of testChats) {
        await db
          .update(embeddedChatsTable)
          .set({ 
            is_public: false,
            is_active: false 
          })
          .where(eq(embeddedChatsTable.uuid, chat.uuid));
      }

      return { 
        success: true, 
        message: `Made ${testChats.length} test chat(s) private`,
        chatsUpdated: testChats.map(c => ({ uuid: c.uuid, name: c.name }))
      };
    }

    return { success: true, message: 'No test chats found' };
  } catch (error) {
    console.error('Error cleaning up test chat:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to cleanup test chat' 
    };
  }
}

export async function getPublicChatsForUser(userId: string) {
  try {
    const chats = await db
      .select({
        uuid: embeddedChatsTable.uuid,
        name: embeddedChatsTable.name,
        is_public: embeddedChatsTable.is_public,
        is_active: embeddedChatsTable.is_active,
        created_at: embeddedChatsTable.created_at
      })
      .from(embeddedChatsTable)
      .where(and(
        eq(embeddedChatsTable.is_public, true),
        eq(embeddedChatsTable.is_active, true)
      ));

    return { success: true, data: chats };
  } catch (error) {
    console.error('Error fetching public chats:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch public chats' 
    };
  }
}