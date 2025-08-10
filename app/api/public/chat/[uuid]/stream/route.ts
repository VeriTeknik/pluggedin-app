import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { 
  embeddedChatsTable, 
  chatConversationsTable,
  chatMessagesTable,
  chatAnalyticsTable,
} from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ChatEngine } from '@/lib/chat-engine';
import { extractApiKey } from '@/lib/api-key';

async function validateApiKeyAccess(chatUuid: string, apiKey: string | null) {
  const [chat] = await db
    .select({
      require_api_key: embeddedChatsTable.require_api_key,
      api_key: embeddedChatsTable.api_key,
    })
    .from(embeddedChatsTable)
    .where(eq(embeddedChatsTable.uuid, chatUuid))
    .limit(1);
  
  if (!chat) return false;
  
  // If API key not required, allow access
  if (!chat.require_api_key) return true;
  
  // If API key required but not provided
  if (!apiKey) return false;
  
  // Validate API key and update last used timestamp
  if (chat.api_key === apiKey) {
    // Update last used timestamp asynchronously (non-blocking)
    db.update(embeddedChatsTable)
      .set({ api_key_last_used_at: new Date() })
      .where(eq(embeddedChatsTable.uuid, chatUuid))
      .execute()
      .catch(console.error);
    
    return true;
  }
  
  return false;
}

// Schema for chat request
const ChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  conversation_id: z.string().uuid().nullish(),
  visitor_info: z.object({
    visitor_id: z.string(),
    name: z.string().optional(),
    email: z.string().email().optional(),
  }),
  authenticated_user: z.object({
    id: z.string(),
    name: z.string(),
    avatar: z.string().optional(),
  }).optional(),
  persona_id: z.number().optional(),
  custom_system_prompt: z.string().optional(),
  attachments: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    size: z.number(),
    url: z.string().optional(),
    data: z.string().optional(),
  })).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const { uuid } = await params;
    
    console.log('Chat stream request for UUID:', uuid);
    
    const origin = req.headers.get('origin') || req.headers.get('referer');
    
    // Check if this is an internal request (same origin)
    const host = req.headers.get('host');
    const isInternalRequest = !origin || (origin && new URL(origin).hostname === host?.split(':')[0]);
    console.log('Is internal request:', isInternalRequest, 'Origin:', origin, 'Host:', host);
    
    // Extract API key from request
    const apiKey = extractApiKey(req);
    console.log('API key provided:', !!apiKey);
    
    // Skip API key validation for internal requests
    if (!isInternalRequest) {
      // Validate API key access for external requests
      const hasApiKeyAccess = await validateApiKeyAccess(uuid, apiKey);
      console.log('API key access granted:', hasApiKeyAccess);
      
      if (!hasApiKeyAccess) {
        return NextResponse.json(
          { error: 'Invalid or missing API key' }, 
          { status: 401 }
        );
      }
    }
    
    // Get embedded chat config
    // For internal requests (demo), allow non-public chats
    const whereConditions = [
      eq(embeddedChatsTable.uuid, uuid),
      eq(embeddedChatsTable.is_active, true)
    ];
    
    // Only require is_public for external requests
    if (!isInternalRequest) {
      whereConditions.push(eq(embeddedChatsTable.is_public, true));
    }
    
    const [chat] = await db
      .select()
      .from(embeddedChatsTable)
      .where(and(...whereConditions))
      .limit(1);

    if (!chat) {
      const errorMsg = isInternalRequest
        ? 'Chat not found or inactive'
        : 'Chat not found, inactive, or not public';
      return NextResponse.json({ error: errorMsg }, { status: 404 });
    }

    // Validate domain (skip for internal requests)
    if (!isInternalRequest && chat.allowed_domains && chat.allowed_domains.length > 0 && origin) {
      const originUrl = new URL(origin);
      const isAllowed = chat.allowed_domains.some(domain => {
        const regex = new RegExp(
          '^' + domain.replace(/\*/g, '.*').replace(/\./g, '\\.') + '$'
        );
        return regex.test(originUrl.hostname);
      });

      if (!isAllowed) {
        return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
      }
    }

    // Parse request body
    const body = await req.json();
    console.log('Request body:', JSON.stringify(body, null, 2));
    
    let validatedData;
    try {
      validatedData = ChatRequestSchema.parse(body);
      console.log('Validation successful');
    } catch (validationError) {
      console.error('Validation error:', validationError);
      throw validationError;
    }

    // Get or create conversation
    let conversationId = validatedData.conversation_id;
    
    if (!conversationId) {
      // Create new conversation
      const [newConversation] = await db
        .insert(chatConversationsTable)
        .values({
          embedded_chat_uuid: chat.uuid,
          visitor_id: validatedData.visitor_info.visitor_id,
          visitor_name: validatedData.visitor_info.name,
          visitor_email: validatedData.visitor_info.email,
          visitor_ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
          visitor_user_agent: req.headers.get('user-agent'),
          referrer_url: origin,
          page_url: req.headers.get('referer'),
          // Add authenticated user info if provided
          authenticated_user_id: validatedData.authenticated_user?.id,
          authenticated_user_name: validatedData.authenticated_user?.name,
          authenticated_user_avatar: validatedData.authenticated_user?.avatar,
        })
        .returning();
      
      conversationId = newConversation.uuid;
      
      // Track analytics
      await updateDailyAnalytics(chat.uuid, {
        conversations_started: 1,
        unique_visitors: 1,
      });
    } else {
      // Verify conversation belongs to this chat
      const [conversation] = await db
        .select()
        .from(chatConversationsTable)
        .where(and(
          eq(chatConversationsTable.uuid, conversationId),
          eq(chatConversationsTable.embedded_chat_uuid, chat.uuid)
        ))
        .limit(1);
      
      if (!conversation) {
        return NextResponse.json({ error: 'Invalid conversation' }, { status: 400 });
      }
      
      // Update heartbeat
      await db
        .update(chatConversationsTable)
        .set({ 
          last_heartbeat: new Date(),
          updated_at: new Date(),
        })
        .where(eq(chatConversationsTable.uuid, conversationId));
    }

    // Initialize chat engine
    console.log('Chat found:', {
      uuid: chat.uuid,
      name: chat.name,
      is_active: chat.is_active,
      is_public: chat.is_public,
      project_uuid: chat.project_uuid
    });
    console.log('Chat model config:', chat.model_config);
    
    let chatEngine;
    try {
      chatEngine = new ChatEngine(chat as any, chat.project_uuid);
      console.log('ChatEngine created, initializing...');
      await chatEngine.initialize();
      console.log('ChatEngine initialized successfully');
    } catch (initError) {
      console.error('ChatEngine initialization failed:', initError);
      throw initError;
    }

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send conversation ID
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ 
              type: 'conversation', 
              conversation_id: conversationId 
            })}\n\n`)
          );

          // Process message
          console.log('Processing message:', validatedData.message);
          for await (const chunk of chatEngine.processMessage(
            validatedData.message,
            conversationId
          )) {
            console.log('Chat chunk:', chunk);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
            );
          }

          // Send done signal
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
          );
          
          // Don't cleanup here - keep session alive for conversation memory
          // await chatEngine.cleanup();
          
          controller.close();
        } catch (error) {
          console.error('Stream error details:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ 
              type: 'error', 
              content: `An error occurred: ${errorMessage}` 
            })}\n\n`)
          );
          
          // Don't cleanup here - keep session alive for conversation memory
          // await chatEngine.cleanup();
          
          controller.close();
        }
      },
    });

    const response = new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

    // Add CORS headers
    if (origin) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    }

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error in chat stream:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') || req.headers.get('referer');
  const response = new NextResponse(null, { status: 200 });
  
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  
  return response;
}

// Helper function to update daily analytics
async function updateDailyAnalytics(
  chatUuid: string,
  updates: Partial<{
    conversations_started: number;
    messages_sent: number;
    messages_received: number;
    contacts_captured: number;
    unique_visitors: number;
  }>
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // Try to update existing record
    const result = await db
      .update(chatAnalyticsTable)
      .set({
        conversations_started: sql`COALESCE(conversations_started, 0) + ${updates.conversations_started || 0}`,
        messages_sent: sql`COALESCE(messages_sent, 0) + ${updates.messages_sent || 0}`,
        messages_received: sql`COALESCE(messages_received, 0) + ${updates.messages_received || 0}`,
        contacts_captured: sql`COALESCE(contacts_captured, 0) + ${updates.contacts_captured || 0}`,
        unique_visitors: sql`COALESCE(unique_visitors, 0) + ${updates.unique_visitors || 0}`,
        updated_at: new Date(),
      })
      .where(and(
        eq(chatAnalyticsTable.embedded_chat_uuid, chatUuid),
        eq(chatAnalyticsTable.date, today)
      ));

    // If no rows updated, create new record
    if (result.rowCount === 0) {
      await db.insert(chatAnalyticsTable).values({
        embedded_chat_uuid: chatUuid,
        date: today,
        ...updates,
      });
    }
  } catch (error) {
    console.error('Error updating analytics:', error);
  }
}