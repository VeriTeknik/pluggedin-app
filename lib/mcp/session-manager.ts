/**
 * Unified Session Manager for MCP Playground and Embedded Chat
 *
 * This module provides a centralized session management system that eliminates
 * duplicate session handling between playground and embedded chat systems.
 *
 * Features:
 * - Unified session lifecycle management
 * - Automatic cleanup and timeout handling
 * - Proper isolation between session types
 * - Process termination handling
 * - Type-safe session management
 */

import { McpServerCleanupFn } from '@h1deya/langchain-mcp-tools';
import { HumanMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';

import { logAuditEvent } from '@/app/actions/audit-logger';
import { ensureLogDirectories } from '@/app/actions/log-retention';
import { queryRag } from '@/app/actions/mcp-playground';
import { createEnhancedMcpLogger } from '@/app/actions/mcp-server-logger';
import { getMcpServers } from '@/app/actions/mcp-servers';
import { getPlaygroundSettings } from '@/app/actions/playground-settings';
import { progressivelyInitializeMcpServers } from '@/app/actions/progressive-mcp-initialization';

import type {
  LLMConfig,
  McpSession,
  QueryExecutionResult,
  SessionConfig,
  SessionCreationResult,
  SessionOptions,
  SessionStatus,
  SessionType,
  ValidationResult} from './config-types.js';
import { initChatModel } from './llm-utils.js';
import {
  buildSystemPrompt,
  calculateSessionTimeout,
  formatServerConfigs,
  getSessionLogIdentifier} from './mcp-utils.js';

// Global cleanup state tracking
let isCleaningUp = false;

/**
 * Unified Session Manager class
 */
class SessionManager {
  private sessions: Map<string, McpSession> = new Map();
  private sessionType: SessionType;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private sessionTimeout: number;

  constructor(sessionType: SessionType, options: SessionOptions = {}) {
    this.sessionType = sessionType;
    this.sessionTimeout = calculateSessionTimeout(sessionType, options.sessionTimeout);
    
    // Start cleanup interval
    this.startCleanupInterval();
    
    // Setup process termination handlers
    this.setupProcessHandlers();
  }

  /**
   * Start the cleanup interval for inactive sessions
   */
  private startCleanupInterval(): void {
    // Clean up every 10 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions();
    }, 10 * 60 * 1000);
  }

  /**
   * Setup process termination handlers for graceful shutdown
   */
  private setupProcessHandlers(): void {
    const handleProcessTermination = async () => {
      if (isCleaningUp) return;
      isCleaningUp = true;

      console.log(`[MCP Session Manager] Cleaning up ${this.sessionType} sessions...`);
      
      // Get all active sessions
      const cleanupPromises = Array.from(this.sessions.entries()).map(async ([sessionId, session]) => {
        try {
          await session.cleanup();
          this.sessions.delete(sessionId);
        } catch (error) {
          console.error(`[MCP] Failed to cleanup session ${sessionId}:`, error);
        }
      });

      try {
        await Promise.all(cleanupPromises);
      } catch (error) {
        console.error(`[MCP] Error during final cleanup for ${this.sessionType}:`, error);
      }
      
      process.exit(0);
    };

    // Handle various termination signals - only add listeners once
    if (!process.listenerCount('SIGTERM')) {
      process.on('SIGTERM', handleProcessTermination);
    }
    if (!process.listenerCount('SIGINT')) {
      process.on('SIGINT', handleProcessTermination);
    }
    if (!process.listenerCount('beforeExit')) {
      process.on('beforeExit', handleProcessTermination);
    }
  }

  /**
   * Clean up sessions that haven't been active for more than the timeout period
   */
  private cleanupInactiveSessions(): void {
    const now = new Date();
    const sessionsToRemove: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now.getTime() - session.lastActive.getTime() > this.sessionTimeout) {
        sessionsToRemove.push(sessionId);
      }
    }

    // Remove inactive sessions
    for (const sessionId of sessionsToRemove) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.cleanup().catch(console.error);
        this.sessions.delete(sessionId);
        console.log(`[MCP] Cleaned up inactive ${this.sessionType} session: ${sessionId}`);
      }
    }
  }

  /**
   * Get a session by ID
   */
  public getSession(sessionId: string): McpSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Update last active timestamp
      session.lastActive = new Date();
    }
    return session;
  }

  /**
   * Check if a session exists and is active
   */
  public hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get all active session IDs
   */
  public getActiveSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get session count
   */
  public getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Create a new session
   */
  public async createSession(
    sessionId: string,
    config: SessionConfig
  ): Promise<ValidationResult> {
    try {
      // Check if session already exists
      if (this.sessions.has(sessionId)) {
        return {
          isValid: false,
          errors: [`Session ${sessionId} already exists`]
        };
      }

      // Validate configuration
      const validation = this.validateSessionConfig(config);
      if (!validation.isValid) {
        return validation;
      }

      // Create the session
      const session = await this.initializeSession(sessionId, config);
      
      // Store the session
      this.sessions.set(sessionId, session);

      console.log(`[MCP] Created ${this.sessionType} session: ${sessionId}`);
      return { isValid: true, errors: [] };
    } catch (error) {
      console.error(`[MCP] Failed to create ${this.sessionType} session:`, error);
      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Get or create a session (returns existing if active)
   */
  public async getOrCreateSession(
    sessionId: string,
    config: SessionConfig
  ): Promise<ValidationResult> {
    // If session exists and is active, return it
    const existingSession = this.getSession(sessionId);
    if (existingSession) {
      return { isValid: true, errors: [] };
    }

    // Create new session
    return this.createSession(sessionId, config);
  }

  /**
   * Update a session's LLM configuration
   */
  public async updateSessionModel(
    sessionId: string,
    llmConfig: LLMConfig
  ): Promise<ValidationResult> {
    try {
      const session = this.getSession(sessionId);
      if (!session) {
        return {
          isValid: false,
          errors: ['No active session found']
        };
      }

      // Validate LLM configuration
      const validation = this.validateLLMConfig(llmConfig);
      if (!validation.isValid) {
        return validation;
      }

      // Create new LLM instance with updated configuration
      const newLlm = initChatModel({
        provider: llmConfig.provider,
        model: llmConfig.model,
        temperature: llmConfig.temperature,
        maxTokens: llmConfig.maxTokens,
        streaming: llmConfig.streaming !== false,
      });

      // Get the current agent's tools and checkpoint saver
      const currentAgent = session.agent;
      
      // Create a new agent with the new LLM but same tools and memory
      const newAgent = createReactAgent({
        llm: newLlm,
        tools: (currentAgent as any).tools || [],
        checkpointSaver: (currentAgent as any).checkpointSaver,
        stateModifier: (state: any) => {
          const systemMessage = buildSystemPrompt();
          return [
            { role: 'system', content: systemMessage },
            ...state.messages
          ];
        }
      });

      // Update the session with new agent and config
      session.agent = newAgent;
      session.llmConfig = llmConfig;

      console.log(`[MCP] Updated ${this.sessionType} session model: ${sessionId}`);
      return { isValid: true, errors: [] };
    } catch (error) {
      console.error(`[MCP] Failed to update ${this.sessionType} session model:`, error);
      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * End a session
   */
  public async endSession(sessionId: string): Promise<ValidationResult> {
    try {
      const session = this.sessions.get(sessionId);
      if (session) {
        await session.cleanup();
        this.sessions.delete(sessionId);
        console.log(`[MCP] Ended ${this.sessionType} session: ${sessionId}`);
      }
      return { isValid: true, errors: [] };
    } catch (error) {
      console.error(`[MCP] Error ending ${this.sessionType} session:`, error);
      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Execute a query against a session
   */
  public async executeQuery(
    sessionId: string,
    query: string,
    options: {
      conversationId?: string;
      enableRag?: boolean;
      ragIdentifier?: string;
    } = {}
  ): Promise<QueryExecutionResult> {
    const session = this.getSession(sessionId);
    if (!session) {
      return {
        success: false,
        error: 'No active session found'
      };
    }

    try {
      let finalQuery = query;
      
      // Handle RAG if enabled
      if (options.enableRag && options.ragIdentifier) {
        const ragResult = await queryRag(query, options.ragIdentifier);
        
        if (ragResult.success && ragResult.context) {
          const MAX_CONTEXT_CHARS = 2000;
          let limitedContext = ragResult.context;
          if (limitedContext.length > MAX_CONTEXT_CHARS) {
            limitedContext = limitedContext.slice(0, MAX_CONTEXT_CHARS) + '\n...[truncated]';
          }
          
          finalQuery = `Context from knowledge base:
${limitedContext}

User question: ${query}

Please answer the user's question using both the provided context and your available tools as appropriate.`;
        }
      }

      // Track streaming state
      let currentAiMessage = '';
      const streamingResponses: any[] = [];
      
      // Use conversationId as thread_id for proper conversation isolation
      const threadId = options.conversationId || sessionId;
      
      // Execute query with streaming
      const agentFinalState = await session.agent.invoke(
        { messages: [new HumanMessage(finalQuery)] },
        {
          configurable: { thread_id: threadId },
          callbacks: [
            {
              handleLLMNewToken: async (token: string) => {
                currentAiMessage += token;
                streamingResponses.push({
                  type: 'token',
                  content: token
                });
              },
              handleToolStart: async (tool: any) => {
                streamingResponses.push({
                  type: 'tool_start',
                  tool: tool.name
                });
              },
              handleToolEnd: async (tool: any) => {
                streamingResponses.push({
                  type: 'tool_end',
                  tool: tool.name
                });
              }
            }
          ]
        }
      );

      // Process messages
      const result = agentFinalState.messages[agentFinalState.messages.length - 1];
      const processedMessages = agentFinalState.messages.map((msg: any) => ({
        role: msg._getType(),
        content: this.safeProcessContent(msg.content),
        timestamp: new Date()
      }));

      return {
        success: true,
        result: this.safeProcessContent(result.content),
        messages: processedMessages,
        streamingResponses,
      };
    } catch (error) {
      console.error(`[MCP] Error executing ${this.sessionType} query:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get session status
   */
  public getSessionStatus(sessionId: string): SessionStatus {
    try {
      const session = this.getSession(sessionId);
      
      if (!session) {
        return {
          success: true,
          isActive: false,
          message: 'No active session found',
          needsRestore: true
        };
      }

      return {
        success: true,
        isActive: true,
        message: 'Session is active',
        llmConfig: session.llmConfig,
        messages: session.messages,
        needsRestore: false
      };
    } catch (error) {
      console.error(`[MCP] Failed to get ${this.sessionType} session status:`, error);
      return {
        success: false,
        isActive: false,
        message: 'Error checking session status',
        needsRestore: false
      };
    }
  }

  /**
   * Restore a lost session
   */
  public async restoreSession(sessionId: string): Promise<SessionCreationResult> {
    try {
      // Check if session already exists
      if (this.sessions.has(sessionId)) {
        return {
          success: true,
          message: 'Session already active'
        };
      }

      // For playground sessions, get saved settings
      if (this.sessionType === 'playground') {
        const settingsResult = await getPlaygroundSettings(sessionId);
        if (!settingsResult.success || !settingsResult.settings) {
          return {
            success: false,
            error: 'Could not retrieve saved playground settings for restoration'
          };
        }

        const settings = settingsResult.settings;
        
        // Get active MCP servers from the profile
        const allServers = await getMcpServers(sessionId);
        const activeServers = allServers.filter(server => server.status === 'ACTIVE');

        // Allow restoration if RAG is enabled, even with no servers
        if (activeServers.length === 0 && !settings.ragEnabled) {
          return {
            success: false,
            error: 'Cannot restore session: No active MCP servers and RAG is disabled'
          };
        }

        // Extract server UUIDs
        const activeServerUuids = activeServers.map(server => server.uuid);

        // Create the LLM config from saved settings
        const llmConfig: LLMConfig = {
          provider: settings.provider as 'openai' | 'anthropic' | 'google' | 'xai',
          model: settings.model,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          logLevel: settings.logLevel as 'error' | 'warn' | 'info' | 'debug',
          streaming: true
        };

        // Create the session
        const result = await this.createSession(sessionId, {
          sessionId,
          profileUuid: sessionId,
          serverUuids: activeServerUuids,
          llmConfig
        });

        if (result.isValid) {
          console.log(`[MCP] Restored playground session: ${sessionId}`);
          return {
            success: true,
            message: 'Session successfully restored',
            llmConfig,
            serverCount: activeServerUuids.length
          };
        }

        return {
          success: false,
          error: result.errors.join(', ')
        };
      }

      return {
        success: false,
        error: 'Session restoration not implemented for this session type'
      };
    } catch (error) {
      console.error(`[MCP] Failed to restore ${this.sessionType} session:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Clean up all sessions
   */
  public async cleanupAllSessions(): Promise<void> {
    const cleanupPromises = Array.from(this.sessions.entries()).map(async ([sessionId, session]) => {
      try {
        await session.cleanup();
        this.sessions.delete(sessionId);
      } catch (error) {
        console.error(`[MCP] Failed to cleanup session ${sessionId}:`, error);
      }
    });

    await Promise.all(cleanupPromises);
    
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Initialize a new session
   */
  private async initializeSession(
    sessionId: string,
    config: SessionConfig
  ): Promise<McpSession> {
    // Ensure log directories exist
    await ensureLogDirectories();

    // Get MCP servers
    const allServers = await getMcpServers(config.profileUuid);
    const selectedServers = allServers.filter(server =>
      config.serverUuids.includes(server.uuid)
    );

    // Format servers for progressive initialization
    const mcpServersConfig = formatServerConfigs(
      selectedServers,
      sessionId,
      this.sessionType
    );

    // Initialize LLM
    const llm = initChatModel({
      provider: config.llmConfig.provider,
      model: config.llmConfig.model,
      temperature: config.llmConfig.temperature,
      maxTokens: config.llmConfig.maxTokens,
      streaming: config.llmConfig.streaming !== false,
    });

    // Create logger
    const logger = await createEnhancedMcpLogger(
      getSessionLogIdentifier(sessionId, this.sessionType),
      config.llmConfig.logLevel || 'info',
      mcpServersConfig
    );

    // Log the session start
    await logAuditEvent({
      profileUuid: config.profileUuid,
      type: 'MCP_REQUEST',
      action: 'START_SESSION',
      metadata: {
        sessionType: this.sessionType,
        serverCount: selectedServers.length,
        serverUuids: config.serverUuids,
        llmProvider: config.llmConfig.provider,
        llmModel: config.llmConfig.model,
      }
    });

    // Initialize MCP servers progressively
    const { tools, cleanup: mcpCleanup, failedServers } = await progressivelyInitializeMcpServers(
      mcpServersConfig,
      getSessionLogIdentifier(sessionId, this.sessionType),
      {
        logger,
        perServerTimeout: 20000,
        totalTimeout: 60000,
        llmProvider: this.mapProviderForLangchain(config.llmConfig.provider)
      }
    );

    // Log any failed servers
    if (failedServers.length > 0) {
      await logger.warn(
        `Some MCP servers failed to initialize: ${failedServers.join(', ')}. Continuing with available servers.`
      );
    }

    // Create agent
    const agent = createReactAgent({
      llm,
      tools,
      checkpointSaver: new MemorySaver(),
      stateModifier: (state: any) => {
        const systemMessage = buildSystemPrompt();
        return [
          { role: 'system', content: systemMessage },
          ...state.messages
        ];
      }
    });

    // Create enhanced cleanup function
    const enhancedCleanup: McpServerCleanupFn = async () => {
      let cleanupError: Error | undefined;
      
      try {
        await Promise.race([
          logger.cleanup(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Logger cleanup timeout')), 5000)
          )
        ]);
      } catch (error) {
        console.error('[MCP] Logger cleanup error:', error);
        cleanupError = error instanceof Error ? error : new Error(String(error));
      }

      try {
        await Promise.race([
          mcpCleanup(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('MCP cleanup timeout')), 10000)
          )
        ]);
      } catch (error) {
        console.error('[MCP] MCP cleanup error:', error);
        if (!cleanupError) {
          cleanupError = error instanceof Error ? error : new Error(String(error));
        }
      }

      try {
        await logAuditEvent({
          profileUuid: config.profileUuid,
          type: 'MCP_REQUEST',
          action: 'END_SESSION',
          metadata: {
            sessionType: this.sessionType,
            error: cleanupError?.message
          }
        });
      } catch (error) {
        console.error('[MCP] Audit logging error during cleanup:', error);
      }

      if (cleanupError) throw cleanupError;
    };

    // Return the session
    return {
      id: sessionId,
      agent,
      cleanup: enhancedCleanup,
      lastActive: new Date(),
      llmConfig: config.llmConfig,
      messages: [],
      profileUuid: config.profileUuid,
      serverUuids: config.serverUuids,
      logger
    };
  }

  /**
   * Validate session configuration
   */
  private validateSessionConfig(config: SessionConfig): ValidationResult {
    const errors: string[] = [];

    if (!config.profileUuid) {
      errors.push('Profile UUID is required');
    }

    if (!config.serverUuids || !Array.isArray(config.serverUuids)) {
      errors.push('Server UUIDs must be an array');
    }

    const llmValidation = this.validateLLMConfig(config.llmConfig);
    if (!llmValidation.isValid) {
      errors.push(...llmValidation.errors);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate LLM configuration
   */
  private validateLLMConfig(config: LLMConfig): ValidationResult {
    const errors: string[] = [];

    if (!config.provider) {
      errors.push('LLM provider is required');
    }

    if (!config.model) {
      errors.push('LLM model is required');
    }

    const validProviders = ['openai', 'anthropic', 'google', 'xai'];
    if (!validProviders.includes(config.provider)) {
      errors.push(`Invalid LLM provider: ${config.provider}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Map provider for langchain-mcp-tools compatibility
   */
  private mapProviderForLangchain(provider: string): 'anthropic' | 'openai' | 'google_genai' | 'google_gemini' | 'none' {
    if (provider === 'anthropic') {
      return 'anthropic';
    } else if (provider === 'openai') {
      return 'openai';
    } else if (provider === 'google') {
      return 'google_genai'; // Use proper Google provider for Gemini compatibility
    } else if (provider === 'xai') {
      return 'openai'; // Map XAI to openai format for compatibility
    }
    return 'none';
  }

  /**
   * Safely process message content
   */
  private safeProcessContent(content: any): string {
    if (content === null || content === undefined) {
      return 'No content';
    }

    if (typeof content === 'string') {
      return content;
    }

    // Handle arrays
    if (Array.isArray(content)) {
      try {
        return content.map(item => {
          if (typeof item === 'object') {
            return JSON.stringify(item);
          }
          return String(item);
        }).join('\n');
      } catch (_e) {
        return `[Array content: ${content.length} items]`;
      }
    }

    // Handle objects
    if (typeof content === 'object') {
      try {
        // Special handling for objects with type and text fields
        if (content.type === 'text' && typeof content.text === 'string') {
          return content.text;
        }

        // If it has a toString method that's not the default Object.toString
        if (content.toString && content.toString !== Object.prototype.toString) {
          return content.toString();
        }

        // Last resort: stringify the object
        return JSON.stringify(content, null, 2);
      } catch (_e) {
        return `[Complex object: ${Object.keys(content).join(', ')}]`;
      }
    }

    // For any other types
    return String(content);
  }
}

// Global session manager instances
export const playgroundSessionManager = new SessionManager('playground');
export const embeddedChatSessionManager = new SessionManager('embedded');

// Export for backward compatibility and direct access
export { SessionManager };