'use server';

/* eslint-disable simple-import-sort/imports */

import { McpServerCleanupFn } from '@h1deya/langchain-mcp-tools';
import { ChatAnthropic } from '@langchain/anthropic';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { MemorySaver } from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { ChatXAI } from '@langchain/xai';
import { and, eq, desc } from 'drizzle-orm';

import { db } from '@/db';
import { McpServerType, chatPersonasTable, chatMessagesTable, embeddedChatsTable, profilesTable, projectsTable, tokenUsageTable, accounts, chatConversationsTable } from '@/db/schema';
import { createEstimatedUsage } from '@/lib/mcp/token-estimator';
import { getSessionTokenUsage, wrapLLMWithTokenTracking } from '@/lib/mcp/token-tracker';
import { calculateTokenCost } from '@/lib/token-pricing';

import { logAuditEvent } from './audit-logger';
import { ensureLogDirectories } from './log-retention';
import { createEnhancedMcpLogger } from './mcp-server-logger';
import { getMcpServers } from './mcp-servers';
import { getPlaygroundSettings } from './playground-settings';
import { progressivelyInitializeMcpServers } from './progressive-mcp-initialization';

// Cache for Anthropic models with last fetch time
interface ModelCache {
  models: Array<{id: string, name: string}>;
  lastFetched: Date;
}

const anthropicModelsCache: ModelCache = {
  models: [],
  lastFetched: new Date(0) // Set to epoch time initially
};

// Store active sessions with cleanup functions
interface McpPlaygroundSession {
  agent: ReturnType<typeof createReactAgent>;
  cleanup: McpServerCleanupFn;
  lastActive: Date;
  llmConfig: {
    provider: 'openai' | 'anthropic' | 'google' | 'xai';
    model: string;
    temperature?: number;
    maxTokens?: number;
    logLevel?: 'error' | 'warn' | 'info' | 'debug';
    streaming?: boolean;
  };
  messages: Array<{role: string, content: string, timestamp?: Date, model?: string}>;
  setClientContext?: (context: any) => void; // Optional setter for client context
}

// Map to store active sessions by profile UUID
const activeSessions: Map<string, McpPlaygroundSession> = new Map();

// Clean up sessions that haven't been active for more than 30 minutes
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds

function cleanupInactiveSessions() {
  const now = new Date();
  for (const [profileUuid, session] of activeSessions.entries()) {
    if (now.getTime() - session.lastActive.getTime() > SESSION_TIMEOUT) {
      // Run cleanup function and delete from activeSessions
      session.cleanup().catch(console.error);
      activeSessions.delete(profileUuid);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupInactiveSessions, 10 * 60 * 1000);

// Function to safely process message content
function safeProcessContent(content: any): string {
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
      // Special handling for objects with type and text fields (common pattern in some frameworks)
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

// Store server logs by profile
const serverLogsByProfile: Map<string, Array<{level: string, message: string, timestamp: Date}>> = new Map();

// Helper function to add a log for a profile - exported for use in mcp-server-logger
export async function addServerLogForProfile(profileUuid: string, level: string, message: string) {
  const logs = serverLogsByProfile.get(profileUuid) || [];

  // Create the new log entry
  const newLog = { level, message, timestamp: new Date() };

  // Add the log to the array with performance optimizations
  logs.push(newLog);

  // Limit to maximum 2000 logs to prevent memory leaks
  const MAX_LOGS_IN_MEMORY = 2000;
  if (logs.length > MAX_LOGS_IN_MEMORY) {
    // More efficient splice - remove in bigger chunks to reduce array manipulation
    // Remove 20% of the logs when we hit the limit instead of just 1 at a time
    const removeCount = Math.floor(MAX_LOGS_IN_MEMORY * 0.2);
    logs.splice(0, removeCount);
  }

  serverLogsByProfile.set(profileUuid, logs);

  // Handle console logs (MCP:INFO, etc.) and add them to the logs
  if (message.includes('[MCP:')) {
    const match = message.match(/\[MCP:(INFO|ERROR|WARN|DEBUG)\]\s+(.*)/i);
    if (match) {
      const mcpLevel = match[1].toLowerCase();
      const mcpMessage = match[2];

      // Check for duplicates in the last ~20 logs rather than the whole array
      // This is more efficient while still catching most duplicates
      // const newLogSignature = `${mcpLevel}:${mcpMessage}`; // Removed unused variable

      const recentLogs = logs.slice(-20);
      const recentDuplicate = recentLogs.some(existingLog => {
        if (existingLog.level === mcpLevel && existingLog.message === mcpMessage) {
          const timeDiff = Math.abs(new Date().getTime() - existingLog.timestamp.getTime());
          return timeDiff < 100; // Increased window to 100ms to catch more duplicates
        }
        return false;
      });

      // Only add if it's not a duplicate
      if (!recentDuplicate) {
        logs.push({
          level: mcpLevel,
          message: mcpMessage,
          timestamp: new Date()
        });
      }
    }
  }
}

// Removed unused ServerLogCapture class definition

// Initialize chat model based on provider
function initChatModel(config: {
  provider: 'openai' | 'anthropic' | 'google' | 'xai';
  model: string;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
}) {
  const { provider, model, temperature = 0, maxTokens, streaming = true } = config;

  if (provider === 'openai') {
    return new ChatOpenAI({
      modelName: model,
      temperature,
      maxTokens,
      streaming,
    });
  } else if (provider === 'anthropic') {
    return new ChatAnthropic({
      modelName: model,
      temperature,
      maxTokens,
      streaming,
    });
  } else if (provider === 'google') {
    return new ChatGoogleGenerativeAI({
      model: model,
      temperature,
      maxOutputTokens: maxTokens,
      streaming,
    }) as any;
  } else if (provider === 'xai') {
    return new ChatXAI({
      model: model,
      temperature,
      maxTokens,
      streaming,
    });
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
}

// Fetch available Anthropic models
export async function getAnthropicModels() {
  try {
    // Check if cache is still valid (less than 24 hours old)
    const now = new Date();
    const cacheAge = now.getTime() - anthropicModelsCache.lastFetched.getTime();
    const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    if (cacheAge < CACHE_TTL && anthropicModelsCache.models.length > 0) {
      // Use cached data
      return {
        success: true,
        models: anthropicModelsCache.models,
        fromCache: true
      };
    }

    // Need to fetch from API
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      throw new Error("Anthropic API key not found");
    }

    const response = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01'
      }
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Format and filter for Claude models only
    const claudeModels = data.models
      .filter((model: any) => model.id.startsWith('claude'))
      .map((model: any) => ({
        id: model.id,
        name: formatModelName(model.id)
      }));

    // Update cache
    anthropicModelsCache.models = claudeModels;
    anthropicModelsCache.lastFetched = now;

    return {
      success: true,
      models: claudeModels,
      fromCache: false
    };
  } catch (error) {
    console.error('Error fetching Anthropic models:', error);

    // Return cached data if available, even if outdated
    if (anthropicModelsCache.models.length > 0) {
      return {
        success: true,
        models: anthropicModelsCache.models,
        fromCache: true,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Helper to format model names for display
function formatModelName(modelId: string): string {
  if (modelId.includes('claude-3-7-sonnet')) return 'Claude 3.7 Sonnet';
  if (modelId.includes('claude-3-5-sonnet')) return 'Claude 3.5 Sonnet';
  if (modelId.includes('claude-3-opus')) return 'Claude 3 Opus';
  if (modelId.includes('claude-3-sonnet')) return 'Claude 3 Sonnet';
  if (modelId.includes('claude-3-haiku')) return 'Claude 3 Haiku';

  // For any other models, capitalize and format nicely
  return modelId
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// Global cleanup state tracking
let isCleaningUp = false;

// Handle process termination
const handleProcessTermination = async () => {
  if (isCleaningUp) return;
  isCleaningUp = true;

  
  // Get all active sessions
  const cleanupPromises = Array.from(activeSessions.entries()).map(async ([profileUuid, session]) => {
    try {
      await session.cleanup();
      activeSessions.delete(profileUuid);
    } catch (error) {
      console.error(`[MCP] Failed to cleanup session for profile ${profileUuid}:`, error);
    }
  });

  try {
    await Promise.all(cleanupPromises);
  } catch (error) {
    console.error('[MCP] Error during final cleanup:', error);
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

// Get playground session status for a profile
export async function getPlaygroundSessionStatus(profileUuid: string) {
  try {
    const session = activeSessions.get(profileUuid);
    
    if (!session) {
      return {
        success: true,
        isActive: false,
        message: 'No active session found',
        needsRestore: true // Indicate that client should attempt to restore
      };
    }

    // Update last active timestamp
    session.lastActive = new Date();

    return {
      success: true,
      isActive: true,
      message: 'Session is active',
      llmConfig: session.llmConfig,
      messages: session.messages,
      needsRestore: false
    };
  } catch (error) {
    console.error('Failed to get playground session status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      isActive: false,
      needsRestore: false
    };
  }
}

// Restore a lost session by recreating it from saved settings
export async function restorePlaygroundSession(profileUuid: string) {
  try {
    // Check if session already exists
    const existingSession = activeSessions.get(profileUuid);
    if (existingSession) {
      return {
        success: true,
        message: 'Session already active',
        wasAlreadyActive: true
      };
    }

    // Get saved playground settings to recreate the session
    const settingsResult = await getPlaygroundSettings(profileUuid);
    if (!settingsResult.success || !settingsResult.settings) {
      return {
        success: false,
        error: 'Could not retrieve saved playground settings for restoration'
      };
    }

    const settings = settingsResult.settings;
    
    // Get active MCP servers from the profile
    const allServers = await getMcpServers(profileUuid);
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
    const llmConfig = {
      provider: settings.provider as 'openai' | 'anthropic' | 'google',
      model: settings.model,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      logLevel: settings.logLevel as 'error' | 'warn' | 'info' | 'debug',
      streaming: true
    };

    // Use the existing session creation function
    const result = await getOrCreatePlaygroundSession(
      profileUuid,
      activeServerUuids,
      llmConfig
    );

    if (result.success) {
      await addServerLogForProfile(
        profileUuid,
        'info',
        `Session restored from saved settings: ${llmConfig.provider} ${llmConfig.model}, ${activeServerUuids.length} servers`
      );
      
      return {
        success: true,
        message: 'Session successfully restored from saved settings',
        llmConfig,
        serverCount: activeServerUuids.length,
        wasAlreadyActive: false
      };
    } else {
      return {
        success: false,
        error: result.error || 'Failed to recreate session during restoration'
      };
    }
  } catch (error) {
    console.error('Failed to restore playground session:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during session restoration'
    };
  }
}

// Update playground session model/LLM configuration
export async function updatePlaygroundSessionModel(
  profileUuid: string,
  llmConfig: {
    provider: 'openai' | 'anthropic' | 'google' | 'xai';
    model: string;
    temperature?: number;
    maxTokens?: number;
    logLevel?: 'error' | 'warn' | 'info' | 'debug';
    streaming?: boolean;
  }
) {
  try {
    const session = activeSessions.get(profileUuid);
    
    if (!session) {
      return {
        success: false,
        error: 'No active session found. Please start a new session.'
      };
    }

    // Update last active timestamp
    session.lastActive = new Date();

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
      tools: (currentAgent as any).tools || [], // Preserve existing tools
      checkpointSaver: (currentAgent as any).checkpointSaver, // Preserve memory
      stateModifier: (state: any) => {
        const systemMessage = `You are an AI assistant specialized in helping users interact with their development environment through MCP (Model Context Protocol) servers and knowledge bases.

INFORMATION SOURCES:
• Knowledge Context: Documentation, schemas, and background information from RAG
• MCP Tools: Real-time data access and system interactions

DECISION FRAMEWORK:
1. Use knowledge context to understand structure, relationships, and background
2. Use MCP tools for current data, live queries, and actions
3. Combine both sources when helpful - context for understanding, tools for current information
4. Always prioritize accuracy and currency of information

EXAMPLES:
• "How many users?" → Check knowledge for user table structure, use MCP tool to get current count
• "Database schema?" → Use knowledge context if available, otherwise query via MCP tools
• "Update settings" → Use MCP tools for the action, knowledge for validation

Be transparent about which sources you use and why. When you have both context and tools available, use them together for the most complete and accurate response.`;

        return [
          { role: 'system', content: systemMessage },
          ...state.messages
        ];
      }
    });

    // Update the session with new agent and config
    session.agent = newAgent;
    session.llmConfig = {
      provider: llmConfig.provider,
      model: llmConfig.model,
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.maxTokens,
      logLevel: llmConfig.logLevel,
      streaming: llmConfig.streaming
    };
    
    // Log the model update
    await addServerLogForProfile(
      profileUuid,
      'info',
      `Model switched to ${llmConfig.provider} ${llmConfig.model} - Agent recreated with new LLM`
    );

    return {
      success: true,
      message: `Model switched to ${llmConfig.provider} ${llmConfig.model}`
    };
  } catch (error) {
    console.error('Failed to update playground session model:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Get or create a playground session for a profile
export async function getOrCreatePlaygroundSession(
  profileUuid: string,
  selectedServerUuids: string[],
  llmConfig: {
    provider: 'openai' | 'anthropic' | 'google' | 'xai';
    model: string;
    temperature?: number;
    maxTokens?: number;
    logLevel?: 'error' | 'warn' | 'info' | 'debug';
    streaming?: boolean;
  }
) {
  // If session exists and is active, return it
  const existingSession = activeSessions.get(profileUuid);
  if (existingSession) {
    // Update last active timestamp
    existingSession.lastActive = new Date();
    return { success: true };
  }

  try {
    // Clear any existing logs for this profile
    serverLogsByProfile.set(profileUuid, []);

    // Ensure log directories exist
    await ensureLogDirectories();

    // Get all MCP servers for the profile
    const allServers = await getMcpServers(profileUuid);

    // Filter servers based on selected UUIDs
    const selectedServers = allServers.filter(server =>
      selectedServerUuids.includes(server.uuid)
    );

    // Read workspace and local bin paths from env or use defaults
    const mcpWorkspacePath = process.env.FIREJAIL_MCP_WORKSPACE ?? '/home/pluggedin/mcp-workspace';
    const _localBinPath = process.env.FIREJAIL_LOCAL_BIN ?? '/home/pluggedin/.local/bin'; // Needed for uvx path

    // Format servers for conversion and apply sandboxing for STDIO using firejail
    const mcpServersConfig: Record<string, any> = {};
    selectedServers.forEach(server => {
      const isFilesystemServer = server.command === 'npx' && server.args?.includes('@modelcontextprotocol/server-filesystem');
      // Removed isUvxServer check


      if (isFilesystemServer && server.type === 'STDIO') {
        // Special handling for filesystem server: set cwd and ensure arg points within workspace
        mcpServersConfig[server.name] = {
          command: server.command,
          // Ensure the last argument is '.' to target the cwd
          args: [...(server.args?.slice(0, -1) ?? []), '.'],
          env: server.env,
          url: server.url,
          type: server.type,
          uuid: server.uuid, // Pass UUID for OAuth HOME detection
          config: server.config, // Pass config for OAuth detection
          transport: 'stdio', // Add explicit transport field
          cwd: mcpWorkspacePath // Explicitly set the CWD for the server process
        };
      } else {
        // Pass other server configs directly; firejail logic is handled in client-wrapper.ts
        mcpServersConfig[server.name] = {
          command: server.command,
          args: server.args,
          env: server.env,
          url: server.url,
          type: server.type,
          uuid: server.uuid, // Pass UUID for OAuth HOME detection
          config: server.config, // Pass config for OAuth detection
          // Do not set cwd for non-filesystem servers unless specifically needed/configured
        };
        
        // Add transport field based on server type
        if (server.type === McpServerType.STDIO) {
          mcpServersConfig[server.name].transport = 'stdio';
        } else if (server.type === McpServerType.SSE) {
          mcpServersConfig[server.name].transport = 'sse';
        } else if (server.type === McpServerType.STREAMABLE_HTTP) {
          mcpServersConfig[server.name].transport = 'streamable_http';
          // Cast server to any to access dynamically added fields
          const serverWithOptions = server as any;
          if (serverWithOptions.streamableHTTPOptions) {
            mcpServersConfig[server.name].streamableHTTPOptions = serverWithOptions.streamableHTTPOptions;
          }
        }
      }

      // Removed absolute path logic for uvx

      // Add applySandboxing flag specifically for playground sessions for STDIO servers
      if (mcpServersConfig[server.name]?.type === 'STDIO') {
        mcpServersConfig[server.name].applySandboxing = true;
      }

    });

    // Initialize LLM with streaming and wrap with token tracking
    const baseLlm = initChatModel({
      provider: llmConfig.provider,
      model: llmConfig.model,
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.maxTokens,
      streaming: llmConfig.streaming !== false, // Default to true
    });
    
    // Wrap with token tracking
    const llm = wrapLLMWithTokenTracking(baseLlm, `playground_${profileUuid}`);

    // Create our enhanced logger using the factory function
    const logger = await createEnhancedMcpLogger(
      profileUuid,
      llmConfig.logLevel || 'info',
      mcpServersConfig
    );

    // Log the session start
    await logAuditEvent({
      profileUuid,
      type: 'MCP_REQUEST',
      action: 'START_SESSION',
      metadata: {
        serverCount: selectedServers.length,
        serverUuids: selectedServerUuids,
        // Log only essential, less sensitive LLM info
        llmProvider: llmConfig.provider,
        llmModel: llmConfig.model,
        // OMIT llmConfig.temperature, llmConfig.maxTokens, llmConfig.logLevel
      }
    });

    try {
      // --- Use Progressive Initialization ---
      // Map the provider to what langchain-mcp-tools expects
      let mappedProvider: 'anthropic' | 'openai' | 'google_genai' | 'google_gemini' | 'none' = 'none';
      
      if (llmConfig.provider === 'anthropic') {
        mappedProvider = 'anthropic';
      } else if (llmConfig.provider === 'openai') {
        mappedProvider = 'openai';
      } else if (llmConfig.provider === 'google') {
        // Use proper Google provider for Gemini compatibility
        mappedProvider = 'google_genai';
      } else if (llmConfig.provider === 'xai') {
        // Map XAI to openai format for compatibility
        mappedProvider = 'openai';
      }
      
      const { tools, cleanup, failedServers } = await progressivelyInitializeMcpServers(
        mcpServersConfig,
        profileUuid,
        {
          logger,
          perServerTimeout: 20000, // 20 seconds per server (configurable)
          totalTimeout: 60000, // 60 seconds total (configurable)
          llmProvider: mappedProvider
        }
      );

      // Log any failed servers
      if (failedServers.length > 0) {
        await addServerLogForProfile(
          profileUuid,
          'warn',
          `Some MCP servers failed to initialize: ${failedServers.join(', ')}. Continuing with available servers.`
        );
      }
      // --- End Progressive Initialization ---

      // Create agent with streaming callbacks using the tools that initialized successfully
      // Bind tools to the LLM to ensure proper function-calling for some providers
      const llmWithTools = (llm as any).bindTools ? (llm as any).bindTools(tools) : llm;
      const agent = createReactAgent({
        llm: llmWithTools,
        tools, // Use the tools returned by progressive initialization
        checkpointSaver: new MemorySaver(),
        stateModifier: (state: any) => {
          const systemMessage = `You are an AI assistant specialized in helping users interact with their development environment through MCP (Model Context Protocol) servers and knowledge bases.

INFORMATION SOURCES:
• Knowledge Context: Documentation, schemas, and background information from RAG
• MCP Tools: Real-time data access and system interactions

DECISION FRAMEWORK:
1. Use knowledge context to understand structure, relationships, and background
2. Use MCP tools for current data, live queries, and actions
3. Combine both sources when helpful - context for understanding, tools for current information
4. Always prioritize accuracy and currency of information

EXAMPLES:
• "How many users?" → Check knowledge for user table structure, use MCP tool to get current count
• "Database schema?" → Use knowledge context if available, otherwise query via MCP tools
• "Update settings" → Use MCP tools for the action, knowledge for validation

Be transparent about which sources you use and why. When you have both context and tools available, use them together for the most complete and accurate response.`;

          return [
            { role: 'system', content: systemMessage },
            ...state.messages
          ];
        }
      });

      // Create enhanced cleanup function using the combined cleanup from progressive init
      const enhancedCleanup: McpServerCleanupFn = async () => {
        let cleanupError: Error | undefined;
        
        try {
          // First close any log files with timeout
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
          // Then call the combined cleanup from progressive init with timeout
          await Promise.race([
            cleanup(),
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
          // Log the session end regardless of previous cleanup errors
          await logAuditEvent({
            profileUuid,
            type: 'MCP_REQUEST',
            action: 'END_SESSION',
            metadata: {
              error: cleanupError?.message
            }
          });
        } catch (error) {
          console.error('[MCP] Audit logging error during cleanup:', error);
        }

        // If we had any cleanup errors, throw the first one
        if (cleanupError) throw cleanupError;
      };

      // Store session
      activeSessions.set(profileUuid, {
        agent,
        cleanup: enhancedCleanup,
        lastActive: new Date(),
        llmConfig: {
          provider: llmConfig.provider,
          model: llmConfig.model,
          temperature: llmConfig.temperature,
          maxTokens: llmConfig.maxTokens,
          logLevel: llmConfig.logLevel,
          streaming: llmConfig.streaming
        },
        messages: []
      });

      return { success: true };
    } catch (error) {
      // Add more detailed error handling for MCP server initialization
      console.error('Failed to initialize MCP servers:', error);
      // Use the improved error message from progressive initialization if available
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during server initialization';
      await addServerLogForProfile(
        profileUuid,
        'error',
        `Failed to initialize MCP servers: ${errorMessage}`
      );

      // Try to clean up any partially initialized resources (logger cleanup)
      try {
        if (logger && typeof logger.cleanup === 'function') {
          await logger.cleanup();
        }
      } catch (cleanupError) {
        console.error('Error during cleanup after initialization failure:', cleanupError);
      }

      throw error; // Re-throw to be caught by the outer try/catch
    }
  } catch (error) {
    console.error('Failed to create playground session:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Function to get server logs with optimized performance
export async function getServerLogs(profileUuid: string) {
  try {
    const logs = serverLogsByProfile.get(profileUuid) || [];

    // Check for partial/streaming messages
    const hasPartialMessage = logs.some(log =>
      log.level === 'streaming' &&
      log.message.includes('"isPartial":true')
    );

    // Limit the returned logs to improve UI performance
    const MAX_LOGS_TO_RETURN = 1000;
    const logsToReturn = logs.length > MAX_LOGS_TO_RETURN
      ? logs.slice(logs.length - MAX_LOGS_TO_RETURN)
      : logs;

    return {
      success: true,
      logs: logsToReturn,
      hasPartialMessage
    };
  } catch (error) {
    console.error('Failed to get server logs:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Execute a query against the playground agent
export async function executePlaygroundQuery(
  profileUuid: string,
  query: string
) {
  const session = activeSessions.get(profileUuid);
  if (!session) {
    return {
      success: false,
      error: 'No active session found. Please start a new session.'
    };
  }

  try {
    // Update last active timestamp
    session.lastActive = new Date();

    // Get playground settings to check if RAG is enabled
    const settingsResult = await getPlaygroundSettings(profileUuid);
    
    let finalQuery = query;
    
    if (settingsResult.success && settingsResult.settings?.ragEnabled) {
      // Get project UUID from profile for project-specific RAG collection
      const profileData = await db.query.profilesTable.findFirst({
        where: eq(profilesTable.uuid, profileUuid),
        columns: { project_uuid: true }
      });
      
      const ragIdentifier = profileData?.project_uuid || profileUuid;
      
      // Query project-specific collection (Hub-bound RAG)
      const ragResult = await queryRag(query, ragIdentifier);
      
      if (ragResult.success && ragResult.context) {
        // Limit RAG context to avoid token overrun
        const MAX_CONTEXT_CHARS = 2000; // Adjust as needed based on model/tokenizer
        let limitedContext = ragResult.context;
        if (limitedContext.length > MAX_CONTEXT_CHARS) {
          limitedContext = limitedContext.slice(0, MAX_CONTEXT_CHARS) + '\n...[truncated]';
        }
        // Prepend (possibly truncated) RAG context to the query
        finalQuery = `Here's additional context from your knowledge base:
${limitedContext}

User question: ${query}

Please answer the user's question using both the provided context and your available tools as appropriate. Use the context for background understanding and tools for current data or actions.`;
        
        // Log RAG usage
        await addServerLogForProfile(
          profileUuid,
          'info',
          `[RAG] Retrieved workspace context: ${ragResult.context.slice(0, 100)}${ragResult.context.length > 100 ? '...' : ''}`
        );
      } else {
        // Log RAG failure but continue with original query
        await addServerLogForProfile(
          profileUuid,
          'warn',
          `[RAG] No context found in workspace: ${ragResult.error || 'No documents available'}`
        );
      }
    }

    // Track streaming state for partial message updates and token usage
    let currentAiMessage = '';
    let isFirstToken = true;
    let streamingTokenUsage: any = null;

    // Check the agent's message history size before invoking
    const MAX_AGENT_MESSAGES = 50; // Limit for LangChain agent's internal message history
    
    // Create a thread ID that includes message count to force new threads when needed
    const threadId = session.messages.length > MAX_AGENT_MESSAGES 
      ? `${profileUuid}_reset_${Date.now()}`  // Force new thread
      : profileUuid;
    
    if (session.messages.length > MAX_AGENT_MESSAGES) {
      await addServerLogForProfile(
        profileUuid,
        'info',
        `[MEMORY] Creating new agent thread due to message limit (${session.messages.length} messages)`
      );
    }
    
    // Execute query with streaming enabled (using finalQuery which may include RAG context)
    const agentFinalState = await session.agent.invoke(
      { messages: [new HumanMessage(finalQuery)] },
      {
        configurable: { thread_id: threadId },
        // Add metadata for LangSmith tracing if enabled
        metadata: {
          user_id: profileUuid,
          session_type: 'playground',
          has_rag: finalQuery !== query,
          model: session.llmConfig.model,
          provider: session.llmConfig.provider
        },
        tags: ['playground', session.llmConfig.provider, session.llmConfig.model],
        callbacks: [
          {
            handleLLMEnd: async (output: any) => {
              // Capture token usage from LLM end callback
              if (output?.llmOutput?.tokenUsage) {
                streamingTokenUsage = output.llmOutput.tokenUsage;
                console.log('[PLAYGROUND] Token usage from LLM callback:', streamingTokenUsage);
              } else if (output?.llmOutput?.usage) {
                streamingTokenUsage = output.llmOutput.usage;
                console.log('[PLAYGROUND] Token usage from LLM callback (usage):', streamingTokenUsage);
              } else if (output?.generations?.[0]?.generationInfo?.usage) {
                streamingTokenUsage = output.generations[0].generationInfo.usage;
                console.log('[PLAYGROUND] Token usage from generation info:', streamingTokenUsage);
              }
            },
            handleLLMNewToken: async (token) => {
              // Add token to current message
              currentAiMessage += token;

              // Log token for debugging
              await addServerLogForProfile(
                profileUuid,
                'info',
                `[STREAMING] Token: ${token.slice(0, 20)}${token.length > 20 ? '...' : ''}`
              );

              // Create a partial message for immediate display
              // When we first get a token, create a partial message in the logs
              if (isFirstToken) {
                const partialMessage = {
                  role: 'ai',
                  content: currentAiMessage,
                  timestamp: new Date(),
                  isPartial: true // Mark as partial for UI handling
                };

                serverLogsByProfile.set(profileUuid + '_partial', [{
                  level: 'streaming',
                  message: JSON.stringify(partialMessage),
                  timestamp: new Date()
                }]);

                isFirstToken = false;
              } else {
                // Update the partial message with new content
                const partialMessage = {
                  role: 'ai',
                  content: currentAiMessage,
                  timestamp: new Date(),
                  isPartial: true
                };

                serverLogsByProfile.set(profileUuid + '_partial', [{
                  level: 'streaming',
                  message: JSON.stringify(partialMessage),
                  timestamp: new Date()
                }]);
              }
            },
            handleToolStart: async (tool) => {
              // Tool çalıştırılmaya başladığında loglara ekliyoruz
              await addServerLogForProfile(
                profileUuid,
                'info',
                `[TOOL] Starting: ${tool.name}`
              );

              // Reset current AI message when tool starts
              currentAiMessage = '';
              isFirstToken = true;
            },
            handleToolEnd: async (output) => {
              // Tool çalışması bittiğinde loglara ekliyoruz
              await addServerLogForProfile(
                profileUuid,
                'info',
                `[TOOL] Completed: ${output?.name || 'unknown'}`
              );
            }
          }
        ]
      }
    );

    // Clean up streaming state
    serverLogsByProfile.delete(profileUuid + '_partial');

    // Process the result
    let result: string;
    let tokenUsage: any = null;
    const lastMessage = agentFinalState.messages[agentFinalState.messages.length - 1];
    if (lastMessage instanceof AIMessage) {
      result = safeProcessContent(lastMessage.content);
      
      
      // Try to get token usage from the AI message or callback
      tokenUsage = streamingTokenUsage || // First try callback data
                   (lastMessage as any).response_metadata?.usage || 
                   (lastMessage as any).usage_metadata ||
                   (lastMessage as any).additional_kwargs?.usage ||
                   (lastMessage as any).usage ||
                   null;
      
      // If still no token usage, try to find it in any AI message
      if (!tokenUsage) {
        for (let i = agentFinalState.messages.length - 1; i >= 0; i--) {
          const msg = agentFinalState.messages[i];
          if (msg instanceof AIMessage) {
            const msgUsage = (msg as any).response_metadata?.usage || 
                            (msg as any).usage_metadata ||
                            (msg as any).additional_kwargs?.usage ||
                            (msg as any).usage ||
                            null;
            if (msgUsage) {
              tokenUsage = msgUsage;
              break;
            }
          }
        }
      }
    } else {
      result = safeProcessContent(lastMessage.content);
    }

    // Get all messages for display with debugging information
    const processedMessages: any[] = [];
    let lastHumanIndex = -1;
    
    agentFinalState.messages.forEach((message: any, index: number) => {
      // Add debugging information
      const contentType = typeof message.content;
      const contentKeys = message.content && typeof message.content === 'object' ?
        Object.keys(message.content) : [];

      const debugInfo = `[DEBUG: Message ${index}, Type: ${message.constructor.name}, Content type: ${contentType}, Keys: ${contentKeys.join(',')}]`;

      if (message instanceof HumanMessage) {
        lastHumanIndex = processedMessages.length;
        processedMessages.push({
          role: 'human',
          content: message.content,
          debug: debugInfo,
          timestamp: new Date()
        });
      } else if (message instanceof AIMessage) {
        const modelInfo = `${session.llmConfig.provider} ${session.llmConfig.model}`;
        processedMessages.push({
          role: 'ai',
          content: safeProcessContent(message.content),
          debug: debugInfo,
          timestamp: new Date(),
          model: modelInfo
        });
      } else {
        // Check if this is the final response after a human message
        const content = safeProcessContent(message.content);
        const isLastMessage = index === agentFinalState.messages.length - 1;
        const hasHumanBefore = lastHumanIndex >= 0;
        const isNotToolCall = !message.name || message.name === 'Agent';
        
        // If this looks like the final AI response, mark it as AI
        if (isLastMessage && hasHumanBefore && isNotToolCall && content.length > 20) {
          const modelInfo = `${session.llmConfig.provider} ${session.llmConfig.model}`;
          processedMessages.push({
            role: 'ai',
            content: content,
            debug: debugInfo + ' [Final Response]',
            timestamp: new Date(),
            model: modelInfo
          });
        } else {
          processedMessages.push({
            role: 'tool',
            content: content,
            debug: debugInfo,
            timestamp: new Date()
          });
        }
      }
    });
    
    const messages = processedMessages;

    // Store the messages in the session for persistence with memory limit
    const MAX_SESSION_MESSAGES = 100; // Limit session message history
    
    // Append new messages to existing ones
    const allMessages = [...session.messages, ...messages];
    
    // Keep only the most recent messages if we exceed the limit
    if (allMessages.length > MAX_SESSION_MESSAGES) {
      session.messages = allMessages.slice(allMessages.length - MAX_SESSION_MESSAGES);
      
      // Log that we trimmed messages
      await addServerLogForProfile(
        profileUuid,
        'info',
        `[MEMORY] Trimmed session messages from ${allMessages.length} to ${MAX_SESSION_MESSAGES}`
      );
    } else {
      session.messages = allMessages;
    }

    // Track token usage in database if available
    if (tokenUsage) {
      try {
        const promptTokens = tokenUsage.prompt_tokens || tokenUsage.promptTokens || 0;
        const completionTokens = tokenUsage.completion_tokens || tokenUsage.completionTokens || 0;
        const totalTokens = tokenUsage.total_tokens || tokenUsage.totalTokens || 
                           (promptTokens + completionTokens) || 0;
        
        // Calculate costs
        const costs = calculateTokenCost(
          session.llmConfig.provider,
          session.llmConfig.model,
          promptTokens,
          completionTokens
        );
        
        // Store in database
        await db.insert(tokenUsageTable).values({
          profile_uuid: profileUuid,
          provider: session.llmConfig.provider,
          model: session.llmConfig.model,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          prompt_cost: costs.promptCost,
          completion_cost: costs.completionCost,
          total_cost: costs.totalCost,
          context_type: 'playground',
          metadata: {
            temperature: session.llmConfig.temperature,
            max_tokens: session.llmConfig.maxTokens,
            has_rag: finalQuery !== query, // Track if RAG was used
            message_count: messages.length
          }
        });
        
      } catch (error) {
        console.error('[PLAYGROUND] Failed to track token usage:', error);
        // Don't fail the request if tracking fails
      }
    }

    return {
      success: true,
      result,
      messages,
      tokenUsage, // Include token usage if available
      debug: {
        messageCount: agentFinalState.messages.length,
        messageTypes: agentFinalState.messages.map((m: any) => m.constructor.name),
        lastMessageContentType: typeof agentFinalState.messages[agentFinalState.messages.length - 1].content
      }
    };
  } catch (error) {
    console.error('Error executing playground query:', error);
    
    // Enhanced error handling for schema-related issues
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = '';
    
    
    // Log the detailed error
    await addServerLogForProfile(
      profileUuid,
      'error',
      `[PLAYGROUND] Query execution failed: ${errorMessage}${errorDetails}`
    );
    
    return {
      success: false,
      error: errorMessage + errorDetails
    };
  }
}

// End a playground session for a profile
export async function endPlaygroundSession(profileUuid: string) {
  const session = activeSessions.get(profileUuid);
  if (session) {
    try {
      await session.cleanup();
      activeSessions.delete(profileUuid);
      return { success: true };
    } catch (error) {
      console.error('Error ending playground session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  return { success: true }; // Session doesn't exist, so consider it ended
}

// Query RAG API for relevant context
export async function queryRag(query: string, ragIdentifier: string) {
  const { ragService } = await import('@/lib/rag-service');
  return ragService.queryForContext(query, ragIdentifier);
}

// Clear server logs for a profile
export async function clearServerLogs(profileUuid: string) {
  try {
    // Clear the server logs from memory
    serverLogsByProfile.set(profileUuid, []);
    
    // Also clear any partial streaming logs
    serverLogsByProfile.delete(profileUuid + '_partial');
    
    return { success: true };
  } catch (error) {
    console.error('Error clearing server logs:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ============================================
// Embedded Chat Functions - Reusing MCP Playground Infrastructure
// ============================================

// Store embedded chat sessions separately to avoid conflicts
const embeddedChatSessions: Map<string, McpPlaygroundSession> = new Map();

// Helper: Verify ownership chain for security
async function verifyEmbeddedChatOwnership(
  chatUuid: string,
  profileUuid: string
): Promise<{ valid: boolean; reason?: string }> {
  const result = await db
    .select({
      chat: embeddedChatsTable,
      profile: profilesTable,
      project: projectsTable,
    })
    .from(embeddedChatsTable)
    .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
    .innerJoin(profilesTable, eq(profilesTable.project_uuid, projectsTable.uuid))
    .where(and(
      eq(embeddedChatsTable.uuid, chatUuid),
      eq(profilesTable.uuid, profileUuid)
    ))
    .limit(1);

  if (result.length === 0) {
    return { valid: false, reason: 'Chat not found or profile mismatch' };
  }

  return { valid: true };
}

// Helper: Get MCP servers with ownership verification
async function getMcpServersWithOwnershipCheck(
  profileUuid: string,
  chatUuid: string
): Promise<any[]> {
  // First verify the chat belongs to this profile's project
  const ownership = await verifyEmbeddedChatOwnership(chatUuid, profileUuid);
  if (!ownership.valid) {
    throw new Error(`Security violation: ${ownership.reason}`);
  }
  
  // Get servers normally - they're already filtered by profile
  return getMcpServers(profileUuid);
}

// Helper: Create completely isolated embedded chat session
async function createIsolatedEmbeddedChatSession(
  chatUuid: string,
  profileUuid: string,
  enabledServers: any[],
  llmConfig: any,
  isAuthenticated: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get complete embedded chat configuration
    const embeddedChatData = await db.query.embeddedChatsTable.findFirst({
      where: eq(embeddedChatsTable.uuid, chatUuid),
      columns: {
        // Core configuration
        name: true,
        description: true,
        custom_instructions: true,
        contact_routing: true,
        welcome_message: true,
        suggested_questions: true,
        
        // Discovery fields
        location: true,
        profession: true,
        expertise: true,
        category: true,
        subcategory: true,
        language: true,
        timezone: true,
        
        // Enhanced discovery
        industry: true,
        keywords: true,
        company_name: true,
        company_size: true,
        target_audience: true,
        service_hours: true,
        response_time: true,
        pricing_model: true,
        
        // AI-optimized fields
        semantic_tags: true,
        use_cases: true,
        capabilities_summary: true,
        personality_traits: true,
        interaction_style: true,
      }
    });
    
    // Get persona data for this chat
    const personas = await db.query.chatPersonasTable.findMany({
      where: and(
        eq(chatPersonasTable.embedded_chat_uuid, chatUuid),
        eq(chatPersonasTable.is_active, true)
      ),
    });
    
    // Find default persona or use first active one
    const activePersona = personas.find(p => p.is_default) || personas[0];
    
    // Log persona information for debugging
    if (activePersona) {
      console.log(`[EMBEDDED] Using persona: ${activePersona.name}`);
      const capabilities = activePersona.capabilities as any[] || [];
      const enabledCapabilities = capabilities.filter(cap => cap.enabled);
      console.log(`[EMBEDDED] Enabled capabilities: ${enabledCapabilities.map(c => c.name).join(', ')}`);
    } else {
      console.log('[EMBEDDED] No active persona found for chat');
    }
    
    // Clear any existing logs for this chat
    serverLogsByProfile.set(`embedded_${chatUuid}`, []);
    
    // Ensure log directories exist
    await ensureLogDirectories();
    
    // Read workspace and local bin paths from env or use defaults
    const mcpWorkspacePath = process.env.FIREJAIL_MCP_WORKSPACE ?? '/home/pluggedin/mcp-workspace';
    
    // Format servers for conversion with CRITICAL sandboxing for embedded chat
    const mcpServersConfig: Record<string, any> = {};
    
    enabledServers.forEach(server => {
      const isFilesystemServer = server.command === 'npx' &&
        server.args?.includes('@modelcontextprotocol/server-filesystem');
      
      if (isFilesystemServer && server.type === 'STDIO') {
        // Special handling for filesystem server
        mcpServersConfig[server.name] = {
          command: server.command,
          args: [...(server.args?.slice(0, -1) ?? []), '.'],
          env: server.env,
          url: server.url,
          type: server.type,
          uuid: server.uuid,
          config: server.config,
          transport: 'stdio',
          cwd: mcpWorkspacePath,
          // CRITICAL: Always apply sandboxing for embedded chat
          applySandboxing: true,
          // Add isolation context for tenant separation
          isolationContext: `embedded_${chatUuid}_${Date.now()}`,
        };
      } else {
        // All other servers
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
          // CRITICAL: Always apply sandboxing for STDIO servers in embedded chat
          mcpServersConfig[server.name].applySandboxing = true;
          mcpServersConfig[server.name].isolationContext = `embedded_${chatUuid}_${Date.now()}`;
        } else if (server.type === McpServerType.SSE) {
          mcpServersConfig[server.name].transport = 'sse';
        } else if (server.type === McpServerType.STREAMABLE_HTTP) {
          mcpServersConfig[server.name].transport = 'streamable_http';
          const serverWithOptions = server as any;
          if (serverWithOptions.streamableHTTPOptions) {
            mcpServersConfig[server.name].streamableHTTPOptions = serverWithOptions.streamableHTTPOptions;
          }
        }
      }
    });
    
    // Initialize LLM with streaming and wrap with token tracking
    const baseLlm = initChatModel({
      provider: llmConfig.provider,
      model: llmConfig.model,
      temperature: llmConfig.temperature ?? 0.7,
      maxTokens: llmConfig.maxTokens ?? 1000,
      streaming: true,
    });
    
    // Wrap with token tracking for embedded chat
    const llm = wrapLLMWithTokenTracking(baseLlm, `embedded_${chatUuid}`);
    
    // Create a logging function specific to this embedded chat
    const _logFunction = async (level: 'error' | 'warn' | 'info' | 'debug', message: string) => {
      await addServerLogForProfile(`embedded_${chatUuid}`, level, message);
    };
    
    // Convert MCP servers to tools using progressive initialization
    const logger = await createEnhancedMcpLogger(
      `embedded_${chatUuid}`,
      llmConfig.logLevel || 'info',
      mcpServersConfig
    );
    
    // Only initialize MCP servers if there are any enabled
    let mcpTools: any[] = [];
    let mcpCleanup: () => Promise<void> = async () => {};
    let failedServers: string[] = [];
    
    if (Object.keys(mcpServersConfig).length > 0) {
      // Map the provider to what langchain-mcp-tools expects
      let mappedProvider: 'anthropic' | 'openai' | 'google_genai' | 'google_gemini' | 'none' = 'none';
      
      if (llmConfig.provider === 'anthropic') {
        mappedProvider = 'anthropic';
      } else if (llmConfig.provider === 'openai') {
        mappedProvider = 'openai';
      } else if (llmConfig.provider === 'google') {
        // Use proper Google provider for Gemini compatibility
        mappedProvider = 'google_genai';
      } else if (llmConfig.provider === 'xai') {
        // Map XAI to openai format for compatibility
        mappedProvider = 'openai';
      }
      
      const result = await progressivelyInitializeMcpServers(
        mcpServersConfig,
        `embedded_${chatUuid}`, // Use chat-specific identifier
        {
          logger,
          perServerTimeout: 20000, // 20 seconds per server
          totalTimeout: 60000, // 60 seconds total
          llmProvider: mappedProvider
        }
      );
      
      mcpTools = result.tools;
      mcpCleanup = result.cleanup;
      failedServers = result.failedServers;
    } else {
      console.log('[EMBEDDED] No MCP servers enabled, skipping initialization');
    }
    
    // Log detailed information about MCP server initialization
    console.log(`[EMBEDDED] MCP server initialization complete:`, {
      totalServers: Object.keys(mcpServersConfig).length,
      successfulTools: mcpTools.length,
      failedServers: failedServers.length,
      failedServerNames: failedServers,
      toolNames: mcpTools.map(t => t.name),
      serverConfigs: Object.keys(mcpServersConfig).map(name => ({
        name,
        type: mcpServersConfig[name].type,
        hasCommand: !!mcpServersConfig[name].command,
        hasArgs: !!mcpServersConfig[name].args
      }))
    });
    
    // Log any failed servers
    if (failedServers.length > 0) {
      await addServerLogForProfile(
        `embedded_${chatUuid}`,
        'warn',
        `[EMBEDDED] Some MCP servers failed to initialize: ${failedServers.join(', ')}. Continuing with available servers.`
      );
    }
    
    // Create persona capability tools if we have an active persona
    let personaTools: any[] = [];
    let integrationManager: any = undefined; // Declare here so it's accessible in closures
    
    if (activePersona) {
      try {
        // Import the tools dynamically
        const { createPersonaTools } = await import('@/lib/integrations/tools');
        const { IntegrationManager } = await import('@/lib/integrations/base-service');
        
        // Merge persona integrations with embedded chat contact routing
        const mergedIntegrations = {
          ...(activePersona.integrations as any || {}),
          communication: {
            ...(activePersona.integrations as any || {})?.communication,
            slack: {
              ...(activePersona.integrations as any || {})?.communication?.slack,
              config: {
                ...(activePersona.integrations as any || {})?.communication?.slack?.config,
                // Override with embedded chat's default channel if specified
                channel: (embeddedChatData?.contact_routing as any)?.slack_channel || 
                        (activePersona.integrations as any || {})?.communication?.slack?.config?.channel
              }
            }
          }
        };

        // Inject calendar tokens based on provider
        try {
          const calendarEnabled = (mergedIntegrations as any)?.calendar?.enabled;
          
          if (calendarEnabled) {
            // Determine calendar provider - check for explicit provider or infer from config
            let calendarProvider = (mergedIntegrations as any)?.calendar?.provider;
            
            // If no provider specified, try to infer from config structure
            if (!calendarProvider) {
              const calendarConfig = (mergedIntegrations as any)?.calendar?.config || {};
              if (calendarConfig.calendlyUrl || calendarConfig.calendly_url) {
                calendarProvider = 'calendly';
              } else if (calendarConfig.calcomUrl || calendarConfig.calcom_url || calendarConfig.cal_com_url) {
                calendarProvider = 'cal_com';
              } else {
                // Default to google_calendar if no specific config found
                calendarProvider = 'google_calendar';
              }
              console.log(`[EMBEDDED] No calendar provider specified, inferred: ${calendarProvider}`);
            }
            
            console.log(`[EMBEDDED] Calendar enabled with provider: ${calendarProvider}`);
            
            // Handle different providers
            switch (calendarProvider) {
              case 'google_calendar':
                console.log('[EMBEDDED] Attempting to inject Google Calendar tokens');
                // Find project owner for this chat
                const chatRow = await db.query.embeddedChatsTable.findFirst({
                  where: eq(embeddedChatsTable.uuid, chatUuid),
                  columns: { project_uuid: true }
                });
                if (chatRow?.project_uuid) {
                  const projectRow = await db.query.projectsTable.findFirst({
                    where: eq(projectsTable.uuid, chatRow.project_uuid),
                    columns: { user_id: true }
                  });
                  if (projectRow?.user_id) {
                    // Import token refresh function dynamically to avoid circular deps
                    const { getValidGoogleAccessToken } = await import('@/lib/auth/google-token-refresh');
                    const validAccessToken = await getValidGoogleAccessToken(projectRow.user_id);
                    
                    if (validAccessToken) {
                      // Get refresh token for completeness
                      const googleAccount = await db.query.accounts.findFirst({
                        where: and(eq(accounts.userId, projectRow.user_id), eq(accounts.provider, 'google')),
                        columns: { refresh_token: true }
                      } as any);
                      
                      // Ensure the calendar object has the provider field and tokens
                      (mergedIntegrations as any).calendar = {
                        ...(mergedIntegrations as any).calendar,
                        provider: 'google_calendar',
                        config: {
                          ...((mergedIntegrations as any).calendar.config || {}),
                          accessToken: validAccessToken,
                          refreshToken: googleAccount?.refresh_token || undefined,
                        }
                      };
                      console.log('[EMBEDDED] Successfully injected Google Calendar tokens (refreshed if needed)');
                      console.log('[EMBEDDED] Calendar config after injection:', JSON.stringify((mergedIntegrations as any).calendar, null, 2));
                    } else {
                      console.log('[EMBEDDED] Failed to get valid Google access token');
                    }
                  } else {
                    console.log('[EMBEDDED] No project user_id found');
                  }
                } else {
                  console.log('[EMBEDDED] No project found for chat');
                }
                break;
                
              case 'calendly':
                // Calendly uses webhook URLs and doesn't need OAuth tokens
                (mergedIntegrations as any).calendar = {
                  ...(mergedIntegrations as any).calendar,
                  provider: 'calendly',
                  config: {
                    ...((mergedIntegrations as any).calendar.config || {}),
                    // Calendly specific config would be here
                  }
                };
                console.log('[EMBEDDED] Calendly provider configured');
                break;
                
              case 'cal_com':
                // Cal.com can use API keys or OAuth
                (mergedIntegrations as any).calendar = {
                  ...(mergedIntegrations as any).calendar,
                  provider: 'cal_com',
                  config: {
                    ...((mergedIntegrations as any).calendar.config || {}),
                    // Cal.com specific config would be here
                  }
                };
                console.log('[EMBEDDED] Cal.com provider configured');
                break;
                
              default:
                console.log(`[EMBEDDED] Unknown calendar provider: ${calendarProvider}`);
            }
          } else {
            console.log('[EMBEDDED] Calendar integration not enabled');
          }
        } catch (e) {
          console.log('[EMBEDDED] Failed to inject calendar tokens:', e);
        }
        
        // Don't log sensitive tokens
        console.log('[EMBEDDED] Final mergedIntegrations before IntegrationManager:', {
          calendar: {
            enabled: mergedIntegrations?.calendar?.enabled,
            provider: mergedIntegrations?.calendar?.provider,
            hasConfig: !!mergedIntegrations?.calendar?.config
          },
          communication: {
            email: mergedIntegrations?.communication?.email,
            slack: {
              enabled: mergedIntegrations?.communication?.slack?.enabled,
              hasConfig: !!mergedIntegrations?.communication?.slack?.config
            }
          }
        });
        
        // Create integration manager with merged configuration
        integrationManager = new IntegrationManager(mergedIntegrations, activePersona.capabilities as any || [], activePersona.id);
        
        // Set up the tool context with integrations access
        // Add integrations config without overwriting the internal integrations Map
        (integrationManager as any).integrationsConfig = mergedIntegrations;
        // Also expose embedded chat UUID for identity fallback in tools
        (integrationManager as any).embeddedChatUuid = chatUuid;
        // Store client context for timezone-aware operations (only available during message processing)
        (integrationManager as any).clientContext = undefined; // Will be set during message processing
        
        const toolContext = {
          integrationManager: integrationManager as any,
          personaId: activePersona.id,
          // Conversation ID is not known at session creation time; tools will
          // resolve latest conversation using embeddedChatUuid when needed
          conversationId: undefined,
          profileUuid, // Add profile UUID for notifications
          clientContext: undefined, // Will be provided during message processing
        };
        
        // Create tools based on enabled capabilities
        personaTools = createPersonaTools(toolContext);
        
        console.log(`[EMBEDDED] Created ${personaTools.length} persona capability tools`);
        
        // Log the created tools
        if (personaTools.length > 0) {
          await addServerLogForProfile(
            `embedded_${chatUuid}`,
            'info',
            `[EMBEDDED] Persona tools created: ${personaTools.map(tool => tool.name).join(', ')}`
          );
        }
      } catch (error) {
        console.error('[EMBEDDED] Failed to create persona tools:', error);
        await addServerLogForProfile(
          `embedded_${chatUuid}`,
          'error',
          `[EMBEDDED] Failed to create persona tools: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
    
    // Combine MCP tools and persona tools
    const toolMap = new Map<string, any>();
    
    // Add MCP tools first (they take priority)
    console.log(`[EMBEDDED] MCP tools (${mcpTools.length}): ${mcpTools.map(t => t.name).join(', ')}`);
    mcpTools.forEach(tool => {
      toolMap.set(tool.name, tool);
    });
    
    // Add persona tools only if they don't conflict
    console.log(`[EMBEDDED] Persona tools (${personaTools.length}): ${personaTools.map(t => t.name).join(', ')}`);
    personaTools.forEach(tool => {
      if (!toolMap.has(tool.name)) {
        toolMap.set(tool.name, tool);
      } else {
        console.log(`[EMBEDDED] Skipping duplicate persona tool: ${tool.name}`);
      }
    });
    
    const allTools = Array.from(toolMap.values());
    
    // Log final tool list
    console.log(`[EMBEDDED] Final tool list (${allTools.length} tools): ${allTools.map(t => t.name).join(', ')}`);
    
    // Enhanced cleanup that handles MCP servers and integration manager
    const enhancedCleanup = async () => {
      try {
        await mcpCleanup();
        // Clear logs for this embedded chat
        serverLogsByProfile.delete(`embedded_${chatUuid}`);
      } catch (error) {
        console.error('[EMBEDDED] Cleanup error:', error);
      }
    };
    
    // Bind tools to the LLM for proper function calling
    const llmWithTools = llm.bindTools ? llm.bindTools(allTools) : llm;
    
    // Capture clientContext for use in closures
    let capturedClientContext: any = undefined;
    
    // Create the agent with tools
    const agent = createReactAgent({
      llm: llmWithTools,
      tools: allTools,
      checkpointSaver: new MemorySaver(), // Enable conversation memory
      stateModifier: (state: any) => {
        // Start with response style guidelines (HIGHEST PRIORITY)
        let systemMessage = `CRITICAL RULES - FOLLOW EXACTLY:
1. MAX 2 SENTENCES per response
2. NEVER auto-fill missing data  
3. For scheduling: NEVER guess emails or convert "next week" to dates
4. Call tools with ONLY what user explicitly provides
5. Let workflows handle missing information
6. NEVER show raw JSON, tool calls, or technical parameters to users
7. When tools return formatted messages, present them naturally
8. Keep responses conversational - no JSON dumps
9. When a tool returns workflowCreated=true, STOP - don't call the tool again
10. One workflow per request - if workflow exists, don't create another

`;
        
        if (!isAuthenticated) {
          systemMessage += `You are interacting with a visitor. You may execute tools. When sending external communications (Slack/email), include any available identity (from session or conversation). If not available, proceed using defaults.\n`;
        }
        
        // Add current date/time context from client (CRITICAL FOR SCHEDULING)
        if (capturedClientContext) {
          const clientDatetime = new Date(capturedClientContext.current_datetime);
          const formatter = new Intl.DateTimeFormat(capturedClientContext.locale || 'en-US', {
            dateStyle: 'full',
            timeStyle: 'short',
            timeZone: capturedClientContext.timezone
          });
          
          systemMessage += `\n\nCURRENT DATE AND TIME:\n`;
          systemMessage += `- Current Time: ${formatter.format(clientDatetime)}\n`;
          systemMessage += `- ISO Format: ${clientDatetime.toISOString()}\n`;
          systemMessage += `- User Timezone: ${capturedClientContext.timezone}\n`;
          systemMessage += `- User Locale: ${capturedClientContext.locale || 'en-US'}\n`;
          systemMessage += `When scheduling meetings or discussing dates/times, always use the user's timezone (${capturedClientContext.timezone}) as reference.\n\n`;
        }
        
        // Then add custom instructions if available
        if (embeddedChatData?.custom_instructions) {
          systemMessage += embeddedChatData.custom_instructions + '\n\n';
        }
        
        // Reinforce brevity
        systemMessage += `REMINDER: Maximum 1-2 sentences. Be direct. No fluff.\n\n`;
        
        // Add core identity
        systemMessage += `YOUR IDENTITY:\n`;
        systemMessage += `- Name: ${embeddedChatData?.name || activePersona?.name || 'AI Assistant'}\n`;
        if (activePersona?.role) systemMessage += `- Role: ${activePersona.role}\n`;
        if (embeddedChatData?.description) systemMessage += `- Description: ${embeddedChatData.description}\n`;
        
        // Add persona instructions if available
        if (activePersona?.instructions) {
          systemMessage += `\n${activePersona.instructions}\n`;
        }
        
        // Add contact information
        systemMessage += `\nCONTACT INFORMATION:\n`;
        if (activePersona?.contact_email) systemMessage += `- Email: ${activePersona.contact_email}\n`;
        if (activePersona?.contact_phone) systemMessage += `- Phone: ${activePersona.contact_phone}\n`;
        if (activePersona?.contact_calendar_link) systemMessage += `- Calendar Link: ${activePersona.contact_calendar_link}\n`;
        if (embeddedChatData?.response_time) systemMessage += `- Response Time: ${embeddedChatData.response_time}\n`;
        if (embeddedChatData?.service_hours) systemMessage += `- Service Hours: ${JSON.stringify(embeddedChatData.service_hours)}\n`;
        
        // Add discovery information
        systemMessage += `\nDISCOVERY INFORMATION:\n`;
        if (embeddedChatData?.location) systemMessage += `- Location: ${embeddedChatData.location}\n`;
        if (embeddedChatData?.profession) systemMessage += `- Profession: ${embeddedChatData.profession}\n`;
        if (embeddedChatData?.expertise?.length) systemMessage += `- Expertise: ${embeddedChatData.expertise.join(', ')}\n`;
        if (embeddedChatData?.category) systemMessage += `- Category: ${embeddedChatData.category}\n`;
        if (embeddedChatData?.subcategory) systemMessage += `- Subcategory: ${embeddedChatData.subcategory}\n`;
        if (embeddedChatData?.language) systemMessage += `- Primary Language: ${embeddedChatData.language}\n`;
        if (embeddedChatData?.timezone) systemMessage += `- Timezone: ${embeddedChatData.timezone}\n`;
        
        // Add professional context
        if (embeddedChatData?.industry || embeddedChatData?.company_name) {
          systemMessage += `\nPROFESSIONAL CONTEXT:\n`;
          if (embeddedChatData?.industry) systemMessage += `- Industry: ${embeddedChatData.industry}\n`;
          if (embeddedChatData?.company_name) systemMessage += `- Company: ${embeddedChatData.company_name}\n`;
          if (embeddedChatData?.company_size) systemMessage += `- Company Size: ${embeddedChatData.company_size}\n`;
          if (embeddedChatData?.target_audience?.length) systemMessage += `- Target Audience: ${embeddedChatData.target_audience.join(', ')}\n`;
          if (embeddedChatData?.keywords?.length) systemMessage += `- Keywords: ${embeddedChatData.keywords.join(', ')}\n`;
          if (embeddedChatData?.pricing_model) systemMessage += `- Pricing Model: ${embeddedChatData.pricing_model}\n`;
        }
        
        // Add AI optimization fields
        systemMessage += `\nAI OPTIMIZATION:\n`;
        if (embeddedChatData?.semantic_tags?.length) systemMessage += `- Semantic Tags: ${embeddedChatData.semantic_tags.join(', ')}\n`;
        if (embeddedChatData?.use_cases?.length) systemMessage += `- Use Cases: ${embeddedChatData.use_cases.join(', ')}\n`;
        if (embeddedChatData?.capabilities_summary) systemMessage += `- Capabilities Summary: ${embeddedChatData.capabilities_summary}\n`;
        if (embeddedChatData?.personality_traits?.length) systemMessage += `- Personality Traits: ${embeddedChatData.personality_traits.join(', ')}\n`;
        if (embeddedChatData?.interaction_style) systemMessage += `- Interaction Style: ${embeddedChatData.interaction_style}\n`;
        
        // Add conversation context
        if (embeddedChatData?.welcome_message || embeddedChatData?.suggested_questions?.length) {
          systemMessage += `\nCONVERSATION CONTEXT:\n`;
          if (embeddedChatData?.welcome_message) systemMessage += `- Welcome Message: ${embeddedChatData.welcome_message}\n`;
          if (embeddedChatData?.suggested_questions?.length) systemMessage += `- Suggested Questions: ${embeddedChatData.suggested_questions.join(', ')}\n`;
        }
        
        // Add default settings
        systemMessage += `\nDEFAULT SETTINGS:\n`;
        if (embeddedChatData && (embeddedChatData.contact_routing as any)?.slack_channel) {
          systemMessage += `- Default Slack Channel: ${(embeddedChatData.contact_routing as any).slack_channel}\n`;
        }
        if (embeddedChatData?.contact_routing) {
          systemMessage += `- Contact Routing: ${JSON.stringify(embeddedChatData.contact_routing as any)}\n`;
        }
        
        // Add authentication-dependent instructions
        // Light-touch guidance only; tools implement identity fallback from conversation/user DB
        if (!isAuthenticated) {
          systemMessage += `

If the user is not authenticated, you may still execute tools. When sending external communications (e.g., Slack), include available identity from context. If identity is not present, proceed using defaults.`;
        } else {
          systemMessage += `

AUTHENTICATION: The user is authenticated.`;
        }
        
        // Add capabilities if they exist
        const capabilities = activePersona?.capabilities as any[] || [];
        const enabledCapabilities = capabilities.filter(cap => cap.enabled);
          
        if (enabledCapabilities.length > 0) {
          systemMessage += `

AVAILABLE CAPABILITIES:
You have the following capabilities enabled to assist users:
`;
            
            // Group capabilities by category
            const capsByCategory: Record<string, any[]> = {};
            enabledCapabilities.forEach(cap => {
              if (!capsByCategory[cap.category]) {
                capsByCategory[cap.category] = [];
              }
              capsByCategory[cap.category].push(cap);
            });
            
            // Add capabilities by category
            Object.entries(capsByCategory).forEach(([category, caps]) => {
              systemMessage += `\n${category.toUpperCase()}:`;
              caps.forEach(cap => {
                systemMessage += `\n• ${cap.name}: ${cap.description}`;
              });
            });
            
            // Add integration status if available
            const integrations = activePersona.integrations as any || {};
            const activeIntegrations: string[] = [];
            
            if (integrations.calendar?.google?.enabled) activeIntegrations.push('Google Calendar');
            if (integrations.communication?.email?.enabled) activeIntegrations.push('Email');
            if (integrations.communication?.slack?.enabled) activeIntegrations.push('Slack');
            if (integrations.crm?.enabled) activeIntegrations.push('CRM');
            
            if (activeIntegrations.length > 0) {
              systemMessage += `\n\nINTEGRATED SERVICES:
The following services are connected and available for use:
${activeIntegrations.map(service => `• ${service}`).join('\n')}`;
            }
            
            systemMessage += `\n\nWhen users ask about what you can do, mention these capabilities. When they request actions that match these capabilities, acknowledge that you can help with those tasks and guide them accordingly.`;
        }
        
        // Add standard MCP context
        systemMessage += `

TOOLS AND SOURCES:
• Use MCP tools directly when needed (function calling). Do not ask the user for configuration values that already exist in persona or server config (e.g., default Slack channel).`;

        // Contact Playbook to drive consistent next steps
        systemMessage += `

SCHEDULING WORKFLOW - SMART DATE HANDLING:
When user says "schedule meeting next week 2 PM":
1. Calculate the date: "next week" = same weekday in the following week
2. Interpret time in user's timezone (${capturedClientContext?.timezone || 'UTC'})
3. Call: book_calendar_meeting with:
   - action: "book"
   - title: from request
   - proposedDateTime: calculated ISO timestamp
   - needsConfirmation: true
4. Ask user: "I'll schedule for [specific date/time]. Who should attend?"
5. The workflow will handle gathering attendees and checking availability

DO interpret relative dates:
- "next week 2 PM" → Calculate specific date
- "tomorrow 3 PM" → Calculate specific date
- "Friday at 10 AM" → Find next Friday

DON'T guess personal info:
- Names → emails (need actual addresses)
- "Cem" ≠ "cem.karaca@gmail.com"`;

        return [
          { role: 'system', content: systemMessage },
          ...state.messages
        ];
      },
    });
    
    // Store session with the chat UUID (isolated from playground)
    const sessionData: McpPlaygroundSession = {
      agent,
      cleanup: enhancedCleanup,
      lastActive: new Date(),
      llmConfig: {
        provider: llmConfig.provider,
        model: llmConfig.model,
        temperature: llmConfig.temperature,
        maxTokens: llmConfig.maxTokens,
        logLevel: llmConfig.logLevel,
        streaming: llmConfig.streaming
      },
      messages: [],
      // Add a setter to update client context during message processing
      setClientContext: (context: any) => {
        capturedClientContext = context;
        if (integrationManager) {
          (integrationManager as any).clientContext = context;
        }
      }
    };
    
    embeddedChatSessions.set(chatUuid, sessionData);
    
    console.log(`[EMBEDDED] Session stored for chat ${chatUuid}`);
    console.log(`[EMBEDDED] Active sessions after storing:`, Array.from(embeddedChatSessions.keys()));
    
    await addServerLogForProfile(
      `embedded_${chatUuid}`,
      'info',
      `[EMBEDDED] Isolated session initialized with ${allTools.length} tools (${mcpTools.length} MCP tools, ${personaTools.length} persona tools) from ${enabledServers.length} servers`
    );
    
    return { success: true };
    
  } catch (error) {
    console.error('[EMBEDDED] Failed to create isolated session:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create session'
    };
  }
}

// Get or create an embedded chat session with complete isolation
export async function getOrCreateEmbeddedChatSession(
  chatUuid: string,
  profileUuid: string,
  enabledServerUuids: string[],
  modelConfig: any
) {
  try {
    // 1. Verify tenant boundaries FIRST
    const chatOwnership = await verifyEmbeddedChatOwnership(chatUuid, profileUuid);
    if (!chatOwnership.valid) {
      console.error(`[SECURITY] Unauthorized embedded chat access attempt: ${chatOwnership.reason}`);
      return {
        success: false,
        error: `Unauthorized: ${chatOwnership.reason}`
      };
    }
    
    // 2. Check if session already exists (never reuse playground sessions)
    if (embeddedChatSessions.has(chatUuid)) {
      return { 
        success: true, 
        message: 'Embedded chat session already active' 
      };
    }
    
    // 3. Check authentication status (treat presence of user id as authenticated)
    let isAuthenticated = false;
    try {
      const { getUserInfoFromAuth } = await import('@/lib/auth');
      const userInfo = await getUserInfoFromAuth();
      isAuthenticated = !!userInfo && !!userInfo.id; // accept authenticated even if email is missing
      console.log('[EMBEDDED] Authentication status:', isAuthenticated ? 'Authenticated' : 'Not authenticated');
    } catch (error) {
      console.log('[EMBEDDED] Authentication check failed:', error);
      isAuthenticated = false;
    }
    
    // 4. Create completely new isolated session
    console.log(`[EMBEDDED] Creating isolated session for chat ${chatUuid}`);
    
    // Get servers with ownership verification
    const allServers = await getMcpServersWithOwnershipCheck(profileUuid, chatUuid);
    
    // Filter to only enabled servers
    const enabledServers = enabledServerUuids.length > 0
      ? allServers.filter(server => enabledServerUuids.includes(server.uuid))
      : []; // If no servers are explicitly enabled, don't enable any
    
    // Create isolated session directly (don't reuse playground logic)
    const result = await createIsolatedEmbeddedChatSession(
      chatUuid,
      profileUuid,
      enabledServers,
      modelConfig,
      isAuthenticated
    );
    
    if (!result.success) {
      return result;
    }
    
    console.log(`[EMBEDDED] Session created successfully for chat ${chatUuid}`);
    return { success: true };
    
  } catch (error) {
    console.error('[EMBEDDED] Error creating embedded chat session:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Execute a query in embedded chat context
export async function executeEmbeddedChatQuery(
  chatUuid: string,
  conversationId: string,
  query: string,
  enableRag: boolean = false,
  clientContext?: {
    timezone: string;
    current_datetime: string;
    locale?: string;
  }
) {
  console.log('[EMBEDDED] Executing query for chat:', chatUuid);
  console.log('[EMBEDDED] Active sessions:', Array.from(embeddedChatSessions.keys()));
  
  let session = embeddedChatSessions.get(chatUuid);
  let debugMode = false;
  let modelConfig: any = null;
  let isAuthenticated = false;
  
  if (!session) {
    console.log('[EMBEDDED] No session found for chat:', chatUuid);
    console.log('[EMBEDDED] Sessions are cleared between API calls in serverless environment');
    console.log('[EMBEDDED] Recreating session for query execution');
    
    // Get the complete chat configuration to recreate the session
    const chatData = await db.query.embeddedChatsTable.findFirst({
      where: eq(embeddedChatsTable.uuid, chatUuid),
      with: {
        project: {
          columns: { active_profile_uuid: true }
        }
      },
      columns: {
        enabled_mcp_server_uuids: true,
        model_config: true,
        debug_mode: true
      }
    });
    
    // Store debug mode and model config from chat data
    debugMode = chatData?.debug_mode || false;
    modelConfig = chatData?.model_config;
    
    if (!chatData || !chatData.project?.active_profile_uuid) {
      return {
        success: false,
        error: 'Chat configuration not found.'
      };
    }
    
    // Recreate the session (this is expected in serverless environments)
    const result = await getOrCreateEmbeddedChatSession(
      chatUuid,
      chatData.project.active_profile_uuid,
      chatData.enabled_mcp_server_uuids || [],
      chatData.model_config
    );
    
    if (!result.success) {
      return {
        success: false,
        error: 'error' in result ? result.error : 'Failed to create session for query.'
      };
    }
    
    // Get the newly created session
    session = embeddedChatSessions.get(chatUuid);
    if (!session) {
      console.log('[EMBEDDED] ERROR: Session was just created but not found in Map');
      console.log('[EMBEDDED] This indicates a critical issue with session storage');
      return {
        success: false,
        error: 'Session state management error. Please try again.'
      };
    }
    
    console.log('[EMBEDDED] Session successfully recreated with agent and tools');
  }
  
  // Always fetch debug mode and model config to ensure we have the latest settings
  // This is needed because the session might have been created before debug mode was enabled
  if (session) {
    const chatData = await db.query.embeddedChatsTable.findFirst({
      where: eq(embeddedChatsTable.uuid, chatUuid),
      columns: { debug_mode: true, model_config: true }
    });
    debugMode = chatData?.debug_mode || false;
    modelConfig = chatData?.model_config || session.llmConfig;
  }
  
  console.log('[EMBEDDED] Session found/recreated, processing query:', query);
  console.log('[EMBEDDED] Debug mode:', debugMode);
  console.log('[EMBEDDED] Model config:', modelConfig);
  
  // Update the session's client context if available
  if (session.setClientContext && clientContext) {
    console.log('[EMBEDDED] Updating session with client context:', clientContext);
    session.setClientContext(clientContext);
  }

  try {
    // Check authentication status (treat presence of user id as authenticated)
    try {
      const { getUserInfoFromAuth } = await import('@/lib/auth');
      const userInfo = await getUserInfoFromAuth();
      isAuthenticated = !!userInfo && !!userInfo.id; // accept authenticated even if email is missing
      console.log('[EMBEDDED] Authentication status:', isAuthenticated ? 'Authenticated' : 'Not authenticated');
    } catch (error) {
      console.log('[EMBEDDED] Authentication check failed:', error);
      isAuthenticated = false;
    }
    
    // Update last active timestamp
    session.lastActive = new Date();

    let finalQuery = query;
    
    // Get user ID and language for memory system (fallback to visitor_id when not authenticated)
    let userId: string | null = null;
    let userLanguage: string | undefined = undefined;
    try {
      const { getUserInfoFromAuth } = await import('@/lib/auth');
      const userInfo = await getUserInfoFromAuth();
      if (userInfo?.id) {
        userId = userInfo.id.toString();
        userLanguage = (userInfo as any).language || 'en';
      }
    } catch (error) {
      console.log('[EMBEDDED] Could not get user info for memory system:', error);
    }
    // Fallback to conversation visitor_id if no authenticated user
    if (!userId) {
      try {
        const conv = await db.query.chatConversationsTable.findFirst({
          where: eq(chatConversationsTable.uuid, conversationId),
          columns: { visitor_id: true }
        });
        if (conv?.visitor_id) {
          userId = conv.visitor_id;
          userLanguage = 'en';
        }
      } catch (e) {
        console.log('[EMBEDDED] Could not resolve visitor_id for memory system:', e);
      }
    }
    
    // Handle Memory Context Injection (if user is authenticated)
    let memoryContext = '';
    if (userId) {
      try {
        const { MemoryStore } = await import('@/lib/chat-memory/memory-store');
        const { MemoryContextBuilder } = await import('@/lib/chat-memory/context-builder');
        
        const memoryStore = new MemoryStore();
        const contextBuilder = new MemoryContextBuilder({
          maxTokens: 300,
          format: 'structured',
          includeMetadata: false,
          groupByType: true
        });
        
        // Get relevant memories
        const memories = await memoryStore.getRelevantMemories(
          userId,
          conversationId,
          query,
          10
        );
        
        if (memories.length > 0) {
          memoryContext = contextBuilder.buildCompactContext(memories, userLanguage);
          console.log(`[EMBEDDED] Injected ${memories.length} memories into context`);
        }
      } catch (error) {
        console.error('[EMBEDDED] Failed to inject memory context:', error);
      }
    }
    
    // Handle RAG if enabled
    let ragContext = '';
    if (enableRag) {
      // Get profile UUID from the session (we might need to store this)
      const profileData = await db.query.embeddedChatsTable.findFirst({
        where: eq(embeddedChatsTable.uuid, chatUuid),
        columns: { project_uuid: true }
      });
      
      if (profileData?.project_uuid) {
        const ragResult = await queryRag(query, profileData.project_uuid);
        
        if (ragResult.success && ragResult.context) {
          const MAX_CONTEXT_CHARS = 2000;
          let limitedContext = ragResult.context;
          if (limitedContext.length > MAX_CONTEXT_CHARS) {
            limitedContext = limitedContext.slice(0, MAX_CONTEXT_CHARS) + '\n...[truncated]';
          }
          
          ragContext = `Context from knowledge base:
${limitedContext}`;
        }
      }
    }
    
    // Combine all contexts (memory + rag + last answer if relevant)
    let combinedContext = '';
    if (memoryContext) combinedContext += memoryContext + '\n\n';
    if (ragContext) combinedContext += ragContext + '\n\n';

    // If user likely refers to a prior result (e.g., "send the result"), append last AI answer
    if (/send( the)? result/i.test(query)) {
      try {
        const lastAi = await db
          .select({ content: chatMessagesTable.content })
          .from(chatMessagesTable)
          .where(and(eq(chatMessagesTable.conversation_uuid, conversationId), eq(chatMessagesTable.role, 'assistant')))
          .orderBy(desc(chatMessagesTable.created_at))
          .limit(1);
        if (lastAi?.[0]?.content) {
          combinedContext += `Previous answer to reference:\n${lastAi[0].content}\n\n`;
        }
      } catch {}
    }

    if (combinedContext) {
      finalQuery = `${combinedContext}User question: ${query}`;
    }

    // Track streaming state and token usage
    let currentAiMessage = '';
    const streamingResponses: any[] = [];
    let currentToolName: string | undefined;
    let streamingTokenUsage: any = null;
    
    // Use conversationId as thread_id for proper conversation isolation
    const threadId = conversationId;
    
    // Execute query with streaming
    const agentFinalState = await session.agent.invoke(
      { messages: [new HumanMessage(finalQuery)] },
      {
        configurable: { thread_id: threadId },
        streamMode: 'values', // Add streamMode for better streaming support
        // Add metadata for LangSmith tracing if enabled
        metadata: {
          chat_uuid: chatUuid,
          conversation_id: conversationId,
          session_type: 'embedded_chat',
          has_rag: enableRag,
          model: modelConfig?.model,
          provider: modelConfig?.provider,
          debug_mode: debugMode
        },
        tags: ['embedded_chat', modelConfig?.provider || 'unknown', modelConfig?.model || 'unknown'],
        callbacks: [
          {
            handleLLMEnd: async (output: any) => {
              // Capture token usage from LLM end callback
              if (output?.llmOutput?.tokenUsage) {
                streamingTokenUsage = output.llmOutput.tokenUsage;
              } else if (output?.llmOutput?.usage) {
                streamingTokenUsage = output.llmOutput.usage;
              } else if (output?.generations?.[0]?.generationInfo?.usage) {
                streamingTokenUsage = output.generations[0].generationInfo.usage;
              }
            },
            handleLLMNewToken: async (token) => {
              currentAiMessage += token;
              streamingResponses.push({
                type: 'token',
                content: token
              });
            },
            handleToolStart: async (tool) => {
              // LangChain may pass different shapes; normalize
              const name = (tool as any)?.name || (tool as any)?.tool || (tool as any)?.id || 'unknown';
              currentToolName = name;
              streamingResponses.push({
                type: 'tool_start',
                tool: name
              });
            },
            handleToolEnd: async (output, runId) => {
              console.log('[TOOL_END] Tool output:', output);
              
              // Extract tool result if available
              let toolResult = null;
              if (output && typeof output === 'object') {
                // The output might be in different formats depending on the tool
                toolResult = output.output || output.result || output;
              }
              
              const name = (output as any)?.name || currentToolName || 'unknown';
              streamingResponses.push({
                type: 'tool_end',
                tool: name,
                result: toolResult
              });
              
              // Check if this is a workflow creation
              if (toolResult?.workflowCreated || toolResult?.workflowId) {
                console.log('[WORKFLOW] Created workflow:', toolResult.workflowId);
              }
            }
          }
        ]
      }
    );

    // Process messages similar to executePlaygroundQuery
    const result = agentFinalState.messages[agentFinalState.messages.length - 1];
    
    
    // Try to get token usage from our tracker first
    const trackedUsage = getSessionTokenUsage(`embedded_${chatUuid}`);
    
    // Try to get token usage from callback or the last AI message
    let tokenUsage: any = trackedUsage || streamingTokenUsage; // First try tracked usage, then callback data
    
    if (!tokenUsage) {
      for (let i = agentFinalState.messages.length - 1; i >= 0; i--) {
        const msg = agentFinalState.messages[i];
        if (msg instanceof AIMessage) {
          tokenUsage = (msg as any).response_metadata?.usage || 
                       (msg as any).response_metadata?.tokenUsage ||
                       (msg as any).usage_metadata ||
                       (msg as any).additional_kwargs?.usage ||
                       null;
          if (tokenUsage) {
            break;
          }
        }
      }
    }
    
    // Convert tracked usage format if needed
    if (tokenUsage && tokenUsage.promptTokens !== undefined) {
      tokenUsage = {
        prompt_tokens: tokenUsage.promptTokens,
        completion_tokens: tokenUsage.completionTokens,
        total_tokens: tokenUsage.totalTokens
      };
    }
    
    // If still no token usage, create an estimate based on the messages
    if (!tokenUsage && modelConfig) {
      // Get the response content
      const responseContent = currentAiMessage || 
        (result instanceof AIMessage ? safeProcessContent(result.content) : '');
      
      if (query && responseContent) {
        tokenUsage = createEstimatedUsage(query, responseContent, modelConfig.provider);
      }
    }
    
    const processedMessages = agentFinalState.messages.map((msg: any) => ({
      role: msg._getType(),
      content: safeProcessContent(msg.content),
      timestamp: new Date()
    }));

    // Add debug info to streaming responses if debug mode is enabled
    if (debugMode && modelConfig) {
      const debugMetadata: any = {
        provider: modelConfig.provider,
        model: modelConfig.model,
        temperature: modelConfig.temperature
      };
      
      // Include token usage if available
      if (tokenUsage) {
        debugMetadata.tokens_used = tokenUsage.total_tokens || 
                                    tokenUsage.totalTokens || 
                                    (tokenUsage.prompt_tokens + tokenUsage.completion_tokens) ||
                                    (tokenUsage.promptTokens + tokenUsage.completionTokens) ||
                                    null;
        debugMetadata.prompt_tokens = tokenUsage.prompt_tokens || tokenUsage.promptTokens || null;
        debugMetadata.completion_tokens = tokenUsage.completion_tokens || tokenUsage.completionTokens || null;
      }
      
      const isEstimated = tokenUsage?.estimated || false;
      const debugChunk = {
        type: 'debug',
        content: `Model: ${modelConfig.provider || 'unknown'} - ${modelConfig.model || 'unknown'}${tokenUsage ? ` | Tokens: ${debugMetadata.tokens_used || 'N/A'}${isEstimated ? ' (est)' : ''}` : ''}`,
        metadata: debugMetadata
      };
      streamingResponses.push(debugChunk);
    }

    // Extract and store memories if user is authenticated
    if (userId) {
      try {
        const { MemoryStore } = await import('@/lib/chat-memory/memory-store');
        const memoryStore = new MemoryStore();
        
        // Get the last few messages for context
        const messages = [
          { role: 'user', content: query },
          { role: 'assistant', content: currentAiMessage || 
            (result instanceof AIMessage ? safeProcessContent(result.content) : '') }
        ];
        
        // Process and store memories asynchronously (don't block the response)
        memoryStore.processConversation(
          conversationId,
          userId,
          messages,
          userLanguage as string | undefined
        ).then(memoryResult => {
          if (memoryResult.conversationMemories > 0 || memoryResult.userMemories > 0) {
            console.log(`[EMBEDDED] Stored ${memoryResult.conversationMemories} conversation memories, ${memoryResult.userMemories} user memories`);
          }
        }).catch(error => {
          console.error('[EMBEDDED] Failed to process conversation memories:', error);
        });
        
      } catch (error) {
        console.error('[EMBEDDED] Failed to initialize memory extraction:', error);
      }
    }
    
    // Track token usage in database if available
    if (tokenUsage && modelConfig) {
      try {
        const promptTokens = tokenUsage.prompt_tokens || tokenUsage.promptTokens || 0;
        const completionTokens = tokenUsage.completion_tokens || tokenUsage.completionTokens || 0;
        const totalTokens = tokenUsage.total_tokens || tokenUsage.totalTokens || 
                           (promptTokens + completionTokens) || 0;
        
        // Calculate costs
        const costs = calculateTokenCost(
          modelConfig.provider,
          modelConfig.model,
          promptTokens,
          completionTokens
        );
        
        // Store in database
        await db.insert(tokenUsageTable).values({
          embedded_chat_uuid: chatUuid,
          conversation_uuid: conversationId,
          provider: modelConfig.provider,
          model: modelConfig.model,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          prompt_cost: costs.promptCost,
          completion_cost: costs.completionCost,
          total_cost: costs.totalCost,
          context_type: 'embedded_chat',
          metadata: {
            temperature: modelConfig.temperature,
            max_tokens: modelConfig.max_tokens,
            has_rag: enableRag,
            debug_mode: debugMode,
            has_memory: !!memoryContext
          }
        });
        
      } catch (error) {
        console.error('[EMBEDDED] Failed to track token usage:', error);
        // Don't fail the request if tracking fails
      }
    }

    return {
      success: true,
      result,
      messages: processedMessages,
      streamingResponses, // Include streaming data for the API to process
      tokenUsage // Include token usage if available
    };
  } catch (error) {
    console.error('Error executing embedded chat query:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// End an embedded chat session
export async function endEmbeddedChatSession(chatUuid: string) {
  const session = embeddedChatSessions.get(chatUuid);
  if (session) {
    try {
      await session.cleanup();
      embeddedChatSessions.delete(chatUuid);
      return { success: true };
    } catch (error) {
      console.error('Error ending embedded chat session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  return { success: true };
}
