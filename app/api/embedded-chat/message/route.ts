import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { embeddedChatsTable, projectsTable, chatMessagesTable, chatConversationsTable, apiKeysTable } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { sendMessageToMCPProxy, sendMessageViaHTTP } from '@/lib/embedded-chat/mcp-integration';
import { generateSimpleAIResponse } from '@/lib/embedded-chat/simple-ai-integration';

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

    // Generate AI response using MCP integration
    const response = await generateChatResponse(message, chat, project, activeConversationId);

    // Store assistant message
    await db.insert(chatMessagesTable).values({
      conversation_uuid: activeConversationId,
      role: 'assistant',
      content: response,
    });

    // Update conversation last activity (using last_heartbeat as proxy)
    await db
      .update(chatConversationsTable)
      .set({ last_heartbeat: new Date() })
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
  project: typeof projectsTable.$inferSelect,
  conversationId?: string
): Promise<string> {
  try {
    // Get the project's API key for MCP proxy authentication
    const [apiKey] = await db
      .select()
      .from(apiKeysTable)
      .where(eq(apiKeysTable.project_uuid, project.uuid))
      .orderBy(desc(apiKeysTable.created_at))
      .limit(1);

    // Check if we have an API key for MCP proxy
    const hasMCPKey = apiKey && apiKey.api_key;

    // Get conversation history if conversationId is provided
    let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    
    if (conversationId) {
      const messages = await db
        .select({
          role: chatMessagesTable.role,
          content: chatMessagesTable.content,
        })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.conversation_uuid, conversationId))
        .orderBy(chatMessagesTable.created_at)
        .limit(10); // Keep last 10 messages for context
      
      conversationHistory = messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));
    }

    // Try MCP proxy first if API key is available
    if (hasMCPKey) {
      try {
        const mcpResponse = await sendMessageToMCPProxy(
          message,
          {
            projectUuid: project.uuid,
            apiKey: apiKey.api_key,
            customInstructions: chat.custom_instructions || undefined,
            enableRag: chat.enable_rag ?? false,
          },
          conversationHistory
        );

        // If there was an error but we got a response, use it
        if (mcpResponse.error) {
          console.error('MCP error (but got response):', mcpResponse.error);
        }

        return mcpResponse.content;
      } catch (mcpError) {
        console.error('MCP proxy failed, falling back to simple AI:', mcpError);
        // Fall through to simple AI
      }
    }
    
    // Fallback to simple AI response (demo mode)
    const simpleResponse = await generateSimpleAIResponse(
      message,
      {
        provider: 'local',
        customInstructions: chat.custom_instructions || undefined,
      },
      conversationHistory
    );
    
    return simpleResponse.content;
  } catch (error) {
    console.error('Error generating chat response:', error);
    
    // Fallback response if MCP integration fails
    return `I apologize, but I'm having trouble processing your request right now. Please try again in a moment.`;
  }
}