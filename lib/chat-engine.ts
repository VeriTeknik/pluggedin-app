import { db } from '@/db';
import {
  embeddedChatsTable,
  chatConversationsTable,
  chatMessagesTable,
  chatPersonasTable,
  mcpServersTable,
  profilesTable,
  projectsTable,
} from '@/db/schema';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Types
export interface ChatChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'system' | 'error';
  content: string;
  metadata?: Record<string, any>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  tool_call_id: string;
  content: string;
  error?: string;
}

export interface DocumentResult {
  id: string;
  content: string;
  metadata: Record<string, any>;
  relevance_score: number;
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

// LLM Interface
interface LLM {
  generate(
    messages: Array<{ role: string; content: string }>,
    config: any
  ): AsyncGenerator<string>;
}

// OpenAI Implementation
class OpenAILLM implements LLM {
  private client: OpenAI;

  constructor(config: any) {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async *generate(
    messages: Array<{ role: string; content: string }>,
    config: any
  ): AsyncGenerator<string> {
    const stream = await this.client.chat.completions.create({
      model: config.model,
      messages: messages as any,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      top_p: config.top_p,
      frequency_penalty: config.frequency_penalty,
      presence_penalty: config.presence_penalty,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
}

// Anthropic Implementation
class AnthropicLLM implements LLM {
  private client: Anthropic;

  constructor(config: any) {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async *generate(
    messages: Array<{ role: string; content: string }>,
    config: any
  ): AsyncGenerator<string> {
    const stream = await this.client.messages.create({
      model: config.model,
      messages: messages.filter(m => m.role !== 'system') as any,
      system: messages.find(m => m.role === 'system')?.content,
      max_tokens: config.max_tokens,
      temperature: config.temperature,
      top_p: config.top_p,
      stream: true,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }
}

// Google Implementation
class GoogleLLM implements LLM {
  private client: GoogleGenerativeAI;

  constructor(config: any) {
    this.client = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  }

  async *generate(
    messages: Array<{ role: string; content: string }>,
    config: any
  ): AsyncGenerator<string> {
    const model = this.client.getGenerativeModel({ 
      model: config.model,
      generationConfig: {
        temperature: config.temperature,
        topP: config.top_p,
        maxOutputTokens: config.max_tokens,
      },
    });

    const chat = model.startChat({
      history: messages.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    });

    const result = await chat.sendMessageStream(
      messages[messages.length - 1].content
    );

    for await (const chunk of result.stream) {
      yield chunk.text();
    }
  }
}

// XAI Implementation (placeholder - similar to OpenAI)
class XAILlm implements LLM {
  async *generate(
    messages: Array<{ role: string; content: string }>,
    config: any
  ): AsyncGenerator<string> {
    // TODO: Implement XAI API integration
    yield 'XAI integration not yet implemented';
  }
}

// Main Chat Engine
export class ChatEngine {
  private chatConfig: EmbeddedChatConfig;
  private projectUuid: string;
  private mcpServers: any[] = [];
  private llm: LLM;

  constructor(chatConfig: EmbeddedChatConfig, projectUuid: string) {
    this.chatConfig = chatConfig;
    this.projectUuid = projectUuid;
    this.llm = this.createLLM(chatConfig.model_config);
  }

  async initialize() {
    // Load all MCP servers from all workspaces in the hub
    const profiles = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.project_uuid, this.projectUuid));
    
    const profileUuids = profiles.map(p => p.uuid);
    
    if (profileUuids.length > 0) {
      const allServers = await db
        .select()
        .from(mcpServersTable)
        .where(inArray(mcpServersTable.profile_uuid, profileUuids));
      
      // Filter enabled servers
      this.mcpServers = this.chatConfig.enabled_mcp_server_uuids.length > 0
        ? allServers.filter(s => this.chatConfig.enabled_mcp_server_uuids.includes(s.uuid))
        : allServers; // If empty, use all servers
    }
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
      
      // Get conversation context
      const context = await this.getConversationContext(conversationId);
      
      // Build messages array
      const messages = [
        {
          role: 'system',
          content: this.buildSystemPrompt(),
        },
        ...context,
        {
          role: 'user',
          content: message,
        },
      ];
      
      // Store user message
      await db.insert(chatMessagesTable).values({
        conversation_uuid: conversationId,
        role: 'user',
        content: message,
        created_by: 'human',
        created_at: new Date(),
      });
      
      // Generate response
      let fullResponse = '';
      for await (const chunk of this.llm.generate(messages, this.chatConfig.model_config)) {
        fullResponse += chunk;
        yield { type: 'text', content: chunk };
      }
      
      // Store assistant message
      await db.insert(chatMessagesTable).values({
        conversation_uuid: conversationId,
        role: 'assistant',
        content: fullResponse,
        created_by: 'ai',
        model_provider: this.chatConfig.model_config.provider,
        model_name: this.chatConfig.model_config.model,
        model_config: this.chatConfig.model_config,
        created_at: new Date(),
      });
      
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

  private createLLM(config: any): LLM {
    switch (config.provider) {
      case 'openai':
        return new OpenAILLM(config);
      case 'anthropic':
        return new AnthropicLLM(config);
      case 'google':
        return new GoogleLLM(config);
      case 'xai':
        return new XAILlm();
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
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

  async executeTools(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    // TODO: Implement MCP tool execution
    return [];
  }

  async searchDocuments(query: string): Promise<DocumentResult[]> {
    if (!this.chatConfig.enable_rag) {
      return [];
    }
    
    // TODO: Implement RAG document search
    return [];
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
  }

  private async trackAnalytics(conversationId: string, metrics: any) {
    // TODO: Implement analytics tracking
  }
}