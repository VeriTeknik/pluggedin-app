import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { embeddedChatsTable, projectsTable, chatMessagesTable, chatConversationsTable } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export async function POST(req: NextRequest) {
  try {
    const { chatUuid, message, conversationId } = await req.json();

    if (!chatUuid || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Fetch embedded chat configuration with project
    const [chatConfig] = await db
      .select({
        chat: embeddedChatsTable,
        project: projectsTable,
      })
      .from(embeddedChatsTable)
      .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .where(and(
        eq(embeddedChatsTable.uuid, chatUuid),
        eq(embeddedChatsTable.is_active, true)
      ))
      .limit(1);

    if (!chatConfig) {
      return NextResponse.json(
        { error: 'Chat not found or inactive' },
        { status: 404 }
      );
    }

    const { chat, project } = chatConfig;

    // Get or create conversation
    let activeConversationId = conversationId;
    
    if (!activeConversationId) {
      // Create new conversation
      const newConversationId = nanoid();
      await db.insert(chatConversationsTable).values({
        uuid: newConversationId,
        embedded_chat_uuid: chatUuid,
        visitor_id: nanoid(), // Could be tied to a session/cookie
        started_at: new Date(),
        metadata: {},
      });
      activeConversationId = newConversationId;
    }

    // Store user message
    await db.insert(chatMessagesTable).values({
      conversation_uuid: activeConversationId,
      role: 'user',
      content: message,
    });

    // Here you would integrate with your MCP proxy or AI service
    // For now, we'll return a placeholder response
    const response = await generateChatResponse(message, chat, project);

    // Store assistant message
    await db.insert(chatMessagesTable).values({
      conversation_uuid: activeConversationId,
      role: 'assistant',
      content: response,
    });

    // Update conversation last activity
    await db
      .update(chatConversationsTable)
      .set({ last_message_at: new Date() })
      .where(eq(chatConversationsTable.uuid, activeConversationId));

    // Update chat last activity
    await db
      .update(embeddedChatsTable)
      .set({
        last_active_at: new Date(),
      })
      .where(eq(embeddedChatsTable.uuid, chatUuid));

    return NextResponse.json({
      response,
      conversationId: activeConversationId,
    });
  } catch (error) {
    console.error('Error processing chat message:', error);
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    );
  }
}

async function generateChatResponse(
  message: string, 
  chat: typeof embeddedChatsTable.$inferSelect, 
  project: typeof projectsTable.$inferSelect
): Promise<string> {
  // TODO: Integrate with MCP proxy or AI service
  // This is where you would:
  // 1. Connect to the MCP proxy using project credentials
  // 2. Send the message to the appropriate MCP server
  // 3. Return the response
  
  // For now, return a placeholder response
  return `Thank you for your message. This is a placeholder response from ${chat.name}. 
  
In a full implementation, this would connect to your MCP servers and provide intelligent responses based on the configured tools and capabilities.

Your message: "${message}"`;
}