import { db } from '@/db';
import {
  embeddedChatsTable,
  chatConversationsTable,
  chatMessagesTable,
  chatPersonasTable,
  projectsTable,
} from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

// Types
export interface ChatChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'system' | 'error';
  content: string;
  metadata?: Record<string, any>;
}


export interface ConversationContext {
  conversation_uuid: string;
  visitor_info?: {
    name?: string;
    email?: string;
    ip?: string;
    user_agent?: string;
    page_url?: string;
  };
  message_history: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
}

export interface EmbeddedChatConfig {
  uuid: string;
  project_uuid: string;
  name: string;
  enabled_mcp_server_uuids: string[];
  enable_rag: boolean;
  custom_instructions?: string;
  welcome_message?: string;
  model_config: {
    provider: string;
    model: string;
    temperature: number;
    max_tokens: number;
    top_p: number;
    frequency_penalty: number;
    presence_penalty: number;
  };
  human_oversight: {
    enabled: boolean;
    mode: 'monitor' | 'assist' | 'takeover';
    notification_channels: string[];
    auto_assign: boolean;
    business_hours: any;
  };
  context_window_size: number;
  max_conversation_length: number;
  offline_config: {
    enabled: boolean;
    message: string;
    email_notification: boolean;
    capture_contact: boolean;
  };
}


// Main Chat Engine
export class ChatEngine {
  private chatConfig: EmbeddedChatConfig;
  private projectUuid: string;
  private sessionInitialized = false;
  private profileUuid: string | null = null;

  constructor(chatConfig: EmbeddedChatConfig, projectUuid: string) {
    this.chatConfig = chatConfig;
    this.projectUuid = projectUuid;
  }

  async initialize() {
    // Get the active profile for this project
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.uuid, this.projectUuid))
      .limit(1);
    
    if (!project?.active_profile_uuid) {
      throw new Error('No active profile found for project');
    }
    
    this.profileUuid = project.active_profile_uuid;
    
    // Initialize session via internal API
    await this.initializeSession();
  }

  private async initializeSession() {
    if (this.sessionInitialized || !this.profileUuid) return;
    
    try {
      console.log('Initializing embedded chat session via internal API');
      
      const response = await fetch(`${this.getBaseUrl()}/api/internal/embedded-chat/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatUuid: this.chatConfig.uuid,
          profileUuid: this.profileUuid,
          enabledServerUuids: this.chatConfig.enabled_mcp_server_uuids,
          modelConfig: this.chatConfig.model_config
        })
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to initialize session');
      }
      
      this.sessionInitialized = true;
      console.log('Embedded chat session initialized successfully');
    } catch (error) {
      console.error('Failed to initialize session:', error);
      throw error;
    }
  }

  private getBaseUrl(): string {
    // In server context, we need to construct the full URL
    if (typeof window === 'undefined') {
      // Use environment variable or default to localhost
      return process.env.NEXTAUTH_URL || 'http://localhost:12005';
    }
    return window.location.origin;
  }

  async *processMessage(
    message: string,
    conversationId: string,
    waitForInstruction: boolean = false
  ): AsyncGenerator<ChatChunk> {
    try {
      // Check if conversation is in human-controlled mode
      const [conversation] = await db
        .select()
        .from(chatConversationsTable)
        .where(eq(chatConversationsTable.uuid, conversationId))
        .limit(1);
      
      if (!conversation) {
        yield { type: 'error', content: 'Conversation not found' };
        return;
      }
      
      if (conversation.status === 'human_controlled') {
        yield { 
          type: 'system', 
          content: 'This conversation is currently handled by a human agent.' 
        };
        return;
      }
      
      if (waitForInstruction || conversation.status === 'waiting') {
        // Store message and wait for human instruction
        await this.queueForHumanReview(message, conversationId);
        yield { 
          type: 'system', 
          content: 'Your message has been received. A human agent will assist you shortly.' 
        };
        return;
      }
      
      // Store user message
      await db.insert(chatMessagesTable).values({
        conversation_uuid: conversationId,
        role: 'user',
        content: message,
        created_by: 'human',
        created_at: new Date(),
      });
      
      // Always use the internal API for processing
      yield* this.processWithInternalAPI(message, conversationId);
      
      // Update conversation heartbeat
      await db
        .update(chatConversationsTable)
        .set({ 
          last_heartbeat: new Date(),
          updated_at: new Date(),
        })
        .where(eq(chatConversationsTable.uuid, conversationId));
      
      // Track analytics
      await this.trackAnalytics(conversationId, {
        messages_sent: 1,
        messages_received: 1,
      });
      
    } catch (error) {
      console.error('Error processing message:', error);
      yield { 
        type: 'error', 
        content: 'An error occurred while processing your message. Please try again.' 
      };
    }
  }

  private async *processWithInternalAPI(
    message: string,
    conversationId: string
  ): AsyncGenerator<ChatChunk> {
    try {
      // Ensure session is initialized
      await this.initializeSession();
      
      console.log('Processing message via internal API');
      
      const response = await fetch(`${this.getBaseUrl()}/api/internal/embedded-chat/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatUuid: this.chatConfig.uuid,
          conversationId,
          query: message,
          enableRag: this.chatConfig.enable_rag
        })
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let hasToolCalls = false;
      
      if (!reader) {
        throw new Error('No response body');
      }
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'token') {
                fullResponse += data.content;
                yield { type: 'content', content: data.content };
              } else if (data.type === 'tool_start') {
                hasToolCalls = true;
                yield { 
                  type: 'tool_call', 
                  content: `Using tool: ${data.tool}`,
                  metadata: { name: data.tool }
                };
              } else if (data.type === 'tool_end') {
                yield { 
                  type: 'tool_result', 
                  content: `Tool ${data.tool} completed`,
                  metadata: { name: data.tool }
                };
              } else if (data.type === 'final') {
                // Final message with complete response
                if (data.messages && data.messages.length > 0) {
                  const lastMessage = data.messages[data.messages.length - 1];
                  if (lastMessage.role === 'ai' && !fullResponse) {
                    fullResponse = lastMessage.content;
                    // Yield the complete response if we haven't streamed it
                    yield { type: 'content', content: fullResponse };
                  }
                }
              }
            } catch (e) {
              console.error('Failed to parse streaming data:', e);
            }
          }
        }
      }
      
      // Store assistant message
      if (fullResponse) {
        await db.insert(chatMessagesTable).values({
          conversation_uuid: conversationId,
          role: 'assistant',
          content: fullResponse,
          created_by: 'ai',
          model_provider: this.chatConfig.model_config.provider,
          model_name: this.chatConfig.model_config.model,
          model_config: this.chatConfig.model_config,
          metadata: hasToolCalls ? { used_tools: true } : null,
          created_at: new Date(),
        });
      }
      
    } catch (error) {
      console.error('Internal API processing error:', error);
      throw error;
    }
  }


  private buildSystemPrompt(): string {
    const parts = [
      `You are ${this.chatConfig.name}, an AI assistant.`,
    ];
    
    if (this.chatConfig.custom_instructions) {
      parts.push(this.chatConfig.custom_instructions);
    }
    
    if (this.chatConfig.welcome_message) {
      parts.push(`When greeting users, use this message: ${this.chatConfig.welcome_message}`);
    }
    
    return parts.join('\n\n');
  }


  private async getConversationContext(
    conversationId: string
  ): Promise<Array<{ role: string; content: string }>> {
    const messages = await db
      .select()
      .from(chatMessagesTable)
      .where(and(
        eq(chatMessagesTable.conversation_uuid, conversationId),
        eq(chatMessagesTable.is_internal, false)
      ))
      .orderBy(desc(chatMessagesTable.created_at))
      .limit(this.chatConfig.context_window_size);
    
    return messages
      .reverse()
      .map(m => ({
        role: m.role,
        content: m.content,
      }));
  }


  async selectPersona(context: ConversationContext): Promise<any> {
    // Get active personas
    const personas = await db
      .select()
      .from(chatPersonasTable)
      .where(and(
        eq(chatPersonasTable.embedded_chat_uuid, this.chatConfig.uuid),
        eq(chatPersonasTable.is_active, true)
      ))
      .orderBy(chatPersonasTable.display_order);
    
    if (personas.length === 0) {
      return null;
    }
    
    // Return default persona or first one
    return personas.find(p => p.is_default) || personas[0];
  }

  private async queueForHumanReview(message: string, conversationId: string) {
    // Update conversation status
    await db
      .update(chatConversationsTable)
      .set({ 
        status: 'waiting',
        updated_at: new Date(),
      })
      .where(eq(chatConversationsTable.uuid, conversationId));
    
    // TODO: Send notification to human agents
  }

  async processHumanInstruction(instruction: string, conversationId: string) {
    // Store instruction as internal message
    await db.insert(chatMessagesTable).values({
      conversation_uuid: conversationId,
      role: 'instruction',
      content: instruction,
      created_by: 'human',
      is_internal: true,
      created_at: new Date(),
    });
    
    // Update conversation status back to active
    await db
      .update(chatConversationsTable)
      .set({ 
        status: 'active',
        updated_at: new Date(),
      })
      .where(eq(chatConversationsTable.uuid, conversationId));
    
    // TODO: Broadcast instruction via WebSocket when monitoring is enabled
    // Commented out for now as WebSocket server is optional
    /*
    if (typeof window === 'undefined') {
      try {
        const { getWebSocketServer } = await import('@/lib/websocket/chat-websocket-server');
        const wsServer = getWebSocketServer();
        wsServer.broadcastMessage(conversationId, {
          type: 'instruction',
          conversationId,
          instruction,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error('Failed to broadcast instruction:', error);
      }
    }
    */
  }

  async transferToHuman(conversationId: string, userId: string) {
    await db
      .update(chatConversationsTable)
      .set({ 
        status: 'human_controlled',
        assigned_user_id: userId,
        assigned_at: new Date(),
        takeover_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(chatConversationsTable.uuid, conversationId));
    
    // TODO: Broadcast takeover via WebSocket when monitoring is enabled
    // Commented out for now as WebSocket server is optional
    /*
    if (typeof window === 'undefined') {
      try {
        const { getWebSocketServer } = await import('@/lib/websocket/chat-websocket-server');
        const wsServer = getWebSocketServer();
        wsServer.broadcastMessage(conversationId, {
          type: 'takeover',
          conversationId,
          takenBy: userId,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error('Failed to broadcast takeover:', error);
      }
    }
    */
  }

  private async trackAnalytics(conversationId: string, metrics: any) {
    // TODO: Implement analytics tracking
  }

  async cleanup() {
    // Clean up session via internal API
    if (this.sessionInitialized) {
      try {
        await fetch(`${this.getBaseUrl()}/api/internal/embedded-chat/end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatUuid: this.chatConfig.uuid
          })
        });
        console.log('Cleaned up embedded chat session');
      } catch (error) {
        console.error('Failed to cleanup session:', error);
      }
    }
    this.sessionInitialized = false;
  }
}