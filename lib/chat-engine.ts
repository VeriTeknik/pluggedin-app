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
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { McpServerCleanupFn } from '@h1deya/langchain-mcp-tools';
import { McpServerType } from '@/db/schema';
import { searchDocuments } from '@/app/actions/library';
import { progressivelyInitializeMcpServersClient } from '@/lib/progressive-mcp-client';
import { MemorySaver } from '@langchain/langgraph';
import type { McpServer } from '@/types/mcp-server';

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
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OPENAI_API_KEY is not configured');
      throw new Error('OPENAI_API_KEY is not configured. Please set the OPENAI_API_KEY environment variable.');
    }
    this.client = new OpenAI({
      apiKey,
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
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    this.client = new Anthropic({
      apiKey,
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
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is not configured');
    }
    this.client = new GoogleGenerativeAI(apiKey);
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

// Mock Implementation for development/testing
class MockLLM implements LLM {
  async *generate(
    messages: Array<{ role: string; content: string }>,
    config: any
  ): AsyncGenerator<string> {
    console.log('Using Mock LLM - No API key configured');
    const lastMessage = messages[messages.length - 1];
    const response = `I'm a mock AI assistant. You said: "${lastMessage.content}". 

To use a real AI model, please configure one of the following environment variables:
- OPENAI_API_KEY for OpenAI models
- ANTHROPIC_API_KEY for Anthropic models
- GOOGLE_API_KEY for Google models

This is a test response to ensure the chat system is working correctly.`;
    
    // Simulate streaming by yielding words one at a time
    const words = response.split(' ');
    for (const word of words) {
      yield word + ' ';
      // Small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}

// Main Chat Engine
export class ChatEngine {
  private chatConfig: EmbeddedChatConfig;
  private projectUuid: string;
  private mcpServers: McpServer[] = [];
  private llm: LLM;
  private agent: any;
  private mcpCleanup: McpServerCleanupFn | null = null;
  private agentInitialized = false;

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
      
      // Filter enabled servers and map to McpServer type
      this.mcpServers = (this.chatConfig.enabled_mcp_server_uuids.length > 0
        ? allServers.filter(s => this.chatConfig.enabled_mcp_server_uuids.includes(s.uuid))
        : allServers
      ).map(s => ({
        ...s,
        config: s.config as Record<string, any> | null,
      })) as McpServer[];
    }
    
    // Initialize LangChain agent with MCP tools
    await this.initializeAgent();
  }

  private async initializeAgent() {
    if (this.agentInitialized) return;
    
    try {
      let tools = [];
      
      if (this.mcpServers.length > 0) {
        console.log('Initializing MCP servers:', this.mcpServers.length);
        
        // Format servers for progressive initialization
        const mcpServersConfig: Record<string, any> = {};
        
        for (const server of this.mcpServers) {
          // Skip servers without command or URL
          if (!server.command && !server.url) {
            console.warn(`Skipping server ${server.name}: no command or URL specified`);
            continue;
          }
          
          mcpServersConfig[server.name] = {
            command: server.command,
            args: server.args,
            env: server.env,
            url: server.url,
            type: server.type,
            uuid: server.uuid,
            config: server.config,
          };
          
          // Add transport field based on server type
          if (server.type === McpServerType.STDIO) {
            mcpServersConfig[server.name].transport = 'stdio';
            mcpServersConfig[server.name].applySandboxing = true; // Enable sandboxing
          } else if (server.type === McpServerType.SSE) {
            mcpServersConfig[server.name].transport = 'sse';
          } else if (server.type === McpServerType.STREAMABLE_HTTP) {
            mcpServersConfig[server.name].transport = 'streamable_http';
          }
        }
        
        // Map provider for langchain-mcp-tools
        let mappedProvider: 'anthropic' | 'openai' | 'google_genai' | 'google_gemini' | 'none' = 'none';
        const provider = this.chatConfig.model_config.provider;
        
        if (provider === 'anthropic') {
          mappedProvider = 'anthropic';
        } else if (provider === 'openai') {
          mappedProvider = 'openai';
        } else if (provider === 'google') {
          mappedProvider = 'openai'; // Use openai format for Google
        }
        
        // Create a simple logger that doesn't use server actions
        const simpleLogger = {
          log: (...args: any[]) => console.log('[MCP]', ...args),
          error: (...args: any[]) => console.error('[MCP]', ...args),
          warn: (...args: any[]) => console.warn('[MCP]', ...args),
          info: (...args: any[]) => console.info('[MCP]', ...args),
          debug: (...args: any[]) => console.debug('[MCP]', ...args),
        };
        
        // Use client-safe progressive initialization
        const initResult = await progressivelyInitializeMcpServersClient(
          mcpServersConfig,
          {
            logger: simpleLogger,
            perServerTimeout: 20000,
            totalTimeout: 60000,
            llmProvider: mappedProvider,
          }
        );
        
        tools = initResult.tools;
        this.mcpCleanup = initResult.cleanup;
        
        if (initResult.failedServers.length > 0) {
          console.warn('Some MCP servers failed to initialize:', initResult.failedServers);
        }
      }
      
      // Create LangChain model based on provider
      let model;
      const config = this.chatConfig.model_config;
      
      switch (config.provider) {
        case 'anthropic':
          model = new ChatAnthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
            modelName: config.model,
            temperature: config.temperature,
            maxTokens: config.max_tokens,
            topP: config.top_p,
          });
          break;
        case 'openai':
          model = new ChatOpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            modelName: config.model,
            temperature: config.temperature,
            maxTokens: config.max_tokens,
            topP: config.top_p,
            frequencyPenalty: config.frequency_penalty,
            presencePenalty: config.presence_penalty,
          });
          break;
        case 'google':
          model = new ChatGoogleGenerativeAI({
            apiKey: process.env.GOOGLE_API_KEY,
            model: config.model,
            temperature: config.temperature,
            maxOutputTokens: config.max_tokens,
            topP: config.top_p,
          });
          break;
        default:
          throw new Error(`Unsupported provider for LangChain: ${config.provider}`);
      }
      
      // Create the agent with tools
      this.agent = createReactAgent({
        llm: model,
        tools,
        checkpointSaver: new MemorySaver(),
      });
      
      this.agentInitialized = true;
      console.log('LangChain agent initialized with', tools.length, 'MCP tools');
    } catch (error) {
      console.error('Failed to initialize agent:', error);
      throw error;
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
      
      // Store user message
      await db.insert(chatMessagesTable).values({
        conversation_uuid: conversationId,
        role: 'user',
        content: message,
        created_by: 'human',
        created_at: new Date(),
      });
      
      // Use LangChain agent if initialized, otherwise fall back to direct LLM
      if (this.agentInitialized && this.agent) {
        yield* this.processWithAgent(message, conversationId);
      } else {
        // Fallback to direct LLM generation
        yield* this.processWithDirectLLM(message, conversationId);
      }
      
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

  private async *processWithAgent(
    message: string,
    conversationId: string
  ): AsyncGenerator<ChatChunk> {
    try {
      // Get conversation context
      const context = await this.getConversationContext(conversationId);
      
      // Build messages for LangChain
      const messages: BaseMessage[] = [];
      
      // Build system prompt with RAG context if available
      let systemPrompt = this.buildSystemPrompt();
      if (this.chatConfig.enable_rag) {
        const ragContext = await this.getRagContext(message);
        if (ragContext) {
          systemPrompt += `\n\nContext from knowledge base:\n${ragContext}`;
        }
      }
      
      // Add system message first
      messages.push(new SystemMessage(systemPrompt));
      
      // Add conversation history
      for (const msg of context) {
        if (msg.role === 'user') {
          messages.push(new HumanMessage(msg.content));
        } else if (msg.role === 'assistant') {
          messages.push(new AIMessage(msg.content));
        }
      }
      
      // Add current message
      messages.push(new HumanMessage(message));
      
      // Stream response from agent
      console.log('Processing with LangChain agent');
      const stream = await this.agent.stream({
        messages,
      });
      
      let fullResponse = '';
      let hasToolCalls = false;
      
      for await (const chunk of stream) {
        // Handle different types of chunks from the agent
        if (chunk.messages) {
          for (const msg of chunk.messages) {
            if (msg._getType() === 'ai') {
              const aiMsg = msg as AIMessage;
              if (aiMsg.content && typeof aiMsg.content === 'string') {
                fullResponse += aiMsg.content;
                yield { type: 'text', content: aiMsg.content };
              }
              
              // Handle tool calls
              if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
                hasToolCalls = true;
                for (const toolCall of aiMsg.tool_calls) {
                  yield { 
                    type: 'tool_call', 
                    content: `Calling tool: ${toolCall.name}`,
                    metadata: toolCall
                  };
                }
              }
            } else if (msg._getType() === 'tool') {
              // Handle tool results
              yield { 
                type: 'tool_result', 
                content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
                metadata: { tool_call_id: msg.tool_call_id }
              };
            }
          }
        }
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
        metadata: hasToolCalls ? { used_tools: true } : null,
        created_at: new Date(),
      });
      
    } catch (error) {
      console.error('Agent processing error:', error);
      // Fall back to direct LLM
      yield* this.processWithDirectLLM(message, conversationId);
    }
  }

  private async *processWithDirectLLM(
    message: string,
    conversationId: string
  ): AsyncGenerator<ChatChunk> {
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
    
    // Generate response
    console.log('Generating response with direct LLM:', this.chatConfig.model_config.provider);
    let fullResponse = '';
    try {
      for await (const chunk of this.llm.generate(messages, this.chatConfig.model_config)) {
        fullResponse += chunk;
        yield { type: 'text', content: chunk };
      }
    } catch (llmError) {
      console.error('LLM generation error:', llmError);
      throw llmError;
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
  }

  private async getRagContext(query: string): Promise<string | null> {
    try {
      // Get all profile UUIDs for the project
      const profiles = await db
        .select()
        .from(profilesTable)
        .where(eq(profilesTable.project_uuid, this.projectUuid));
      
      if (profiles.length === 0) return null;
      
      // Search across all profiles in the project
      const allResults = [];
      for (const profile of profiles) {
        const result = await searchDocuments({
          query,
          profileUuid: profile.uuid,
          limit: 3,
        });
        
        if (result.success && result.results) {
          allResults.push(...result.results);
        }
      }
      
      if (allResults.length === 0) return null;
      
      // Sort by relevance and take top results
      const topResults = allResults
        .sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0))
        .slice(0, 5);
      
      // Format context
      const context = topResults
        .map(doc => `[${doc.title}]\n${doc.content_preview || doc.content}\n`)
        .join('\n---\n');
      
      return context;
    } catch (error) {
      console.error('Failed to get RAG context:', error);
      return null;
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
    
    // Add MCP tools information if available
    if (this.mcpServers.length > 0 && this.agentInitialized) {
      parts.push(`You have access to MCP tools from ${this.mcpServers.length} connected servers. Use them when appropriate to help answer questions or perform tasks.`);
    }
    
    // Add RAG information if enabled
    if (this.chatConfig.enable_rag) {
      parts.push('You have access to a knowledge base. Relevant context will be provided when available.');
    }
    
    return parts.join('\n\n');
  }

  private createLLM(config: any): LLM {
    try {
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
    } catch (error) {
      console.warn('Failed to create LLM:', error);
      console.warn('Using Mock LLM for development');
      return new MockLLM();
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
    // Clean up MCP connections using the cleanup function from progressive init
    if (this.mcpCleanup) {
      try {
        await this.mcpCleanup();
        console.log('Cleaned up MCP server connections');
      } catch (error) {
        console.error('Failed to cleanup MCP connections:', error);
      }
    }
    this.agentInitialized = false;
  }
}