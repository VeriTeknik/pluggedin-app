import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { embeddedChatsTable, projectsTable, chatMessagesTable, chatConversationsTable, chatPersonasTable } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ChatEngine } from '@/lib/chat-engine';
import { sendMessageToMCPProxy } from '@/lib/embedded-chat/mcp-integration';
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
        .limit(chat.context_window_size || 10);
      
      conversationHistory = messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));
    }

    // Get active personas if configured
    let activePersona = null;
    if (chat.uuid) {
      const personas = await db
        .select()
        .from(chatPersonasTable)
        .where(and(
          eq(chatPersonasTable.embedded_chat_uuid, chat.uuid),
          eq(chatPersonasTable.is_active, true),
          eq(chatPersonasTable.is_default, true)
        ))
        .limit(1);
      
      if (personas.length > 0) {
        activePersona = personas[0];
      }
    }

    // Check if we have a configured model
    const modelConfig = chat.model_config as any;
    
    if (modelConfig && modelConfig.provider) {
      try {
        // Create chat config for ChatEngine
        const chatConfig = {
          uuid: chat.uuid,
          project_uuid: project.uuid,
          name: chat.name,
          model_config: modelConfig,
          enabled_mcp_server_uuids: chat.enabled_mcp_server_uuids || [],
          enable_rag: chat.enable_rag || false,
          context_window_size: chat.context_window_size || 10,
          max_conversation_length: chat.max_conversation_length || 100,
          custom_instructions: chat.custom_instructions || undefined,
          welcome_message: chat.welcome_message || undefined,
          human_oversight: (chat.human_oversight as any) || {
            enabled: false,
            mode: 'monitor' as const,
            notification_channels: ['app'],
            auto_assign: false,
            business_hours: null,
          },
          offline_config: (chat.offline_config as any) || {
            enabled: true,
            message: "We'll get back to you soon!",
            email_notification: true,
            capture_contact: true,
          },
        };
        
        // Use ChatEngine with configured model
        const chatEngine = new ChatEngine(chatConfig, project.uuid);
        
        // Apply persona instructions to custom instructions if needed
        if (activePersona) {
          const personaInstructions = `You are ${activePersona.name}${activePersona.role ? `, ${activePersona.role}` : ''}. ${activePersona.instructions}`;
          chatConfig.custom_instructions = chatConfig.custom_instructions 
            ? `${personaInstructions}\n\n${chatConfig.custom_instructions}`
            : personaInstructions;
        }

        // Generate response using ChatEngine's processMessage
        let fullResponse = '';
        const responseStream = chatEngine.processMessage(
          message,
          conversationId || '',
          false // Not waiting for instruction
        );
        
        for await (const chunk of responseStream) {
          if (chunk.type === 'text') {
            fullResponse += chunk.content;
          } else if (chunk.type === 'error') {
            console.error('Chat engine error:', chunk);
            throw new Error(chunk.content || 'Chat engine error');
          } else if (chunk.type === 'system') {
            // Log system messages for debugging
            console.log('System message:', chunk.content);
          }
        }

        // Track token usage if available
        // TODO: Add token tracking to database

        return fullResponse;
      } catch (engineError) {
        console.error('ChatEngine failed, trying MCP proxy:', engineError);
        
        // Try MCP proxy as fallback
        try {
          const mcpResponse = await sendMessageToMCPProxy(
            message,
            {
              projectUuid: project.uuid,
              apiKey: '', // We don't need MCP API key for this
              customInstructions: chat.custom_instructions || undefined,
              enableRag: chat.enable_rag ?? false,
            },
            conversationHistory
          );
          
          return mcpResponse.content;
        } catch (mcpError) {
          console.error('MCP proxy also failed:', mcpError);
        }
      }
    }
    
    // Final fallback to simple AI response (demo mode)
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
    
    // Fallback response if everything fails
    return `I apologize, but I'm having trouble processing your request right now. Please try again in a moment.`;
  }
}