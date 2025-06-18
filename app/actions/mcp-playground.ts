'use server';

// Import progressivelyInitializeMcpServers and other necessary modules
import { McpServerCleanupFn } from '@h1deya/langchain-mcp-tools';
import { ChatAnthropic } from '@langchain/anthropic';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { MemorySaver } from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { eq } from 'drizzle-orm';

import { logAuditEvent } from '@/app/actions/audit-logger'; // Correct path alias
import { ensureLogDirectories } from '@/app/actions/log-retention'; // Correct path alias
import { createEnhancedMcpLogger } from '@/app/actions/mcp-server-logger'; // Correct path alias
import { getMcpServers } from '@/app/actions/mcp-servers'; // Correct path alias
import { getPlaygroundSettings } from '@/app/actions/playground-settings'; // Add this import
import { db } from '@/db';
import { profilesTable } from '@/db/schema';

import { progressivelyInitializeMcpServers } from './progressive-mcp-initialization'; // Import the new function

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
    provider: 'openai' | 'anthropic' | 'google';
    model: string;
    temperature?: number;
    maxTokens?: number;
    logLevel?: 'error' | 'warn' | 'info' | 'debug';
    streaming?: boolean;
  };
  messages: Array<{role: string, content: string, timestamp?: Date, model?: string}>;
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
  provider: 'openai' | 'anthropic' | 'google';
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

  console.log('[MCP] Starting graceful shutdown...');
  
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
    console.log('[MCP] All sessions cleaned up successfully');
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
    provider: 'openai' | 'anthropic' | 'google';
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
    provider: 'openai' | 'anthropic' | 'google';
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
    const localBinPath = process.env.FIREJAIL_LOCAL_BIN ?? '/home/pluggedin/.local/bin'; // Needed for uvx path

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
          // Do not set cwd for non-filesystem servers unless specifically needed/configured
        };
      }

      // Removed absolute path logic for uvx

      // Add applySandboxing flag specifically for playground sessions for STDIO servers
      if (mcpServersConfig[server.name]?.type === 'STDIO') {
        mcpServersConfig[server.name].applySandboxing = true;
      }
    });

    // Initialize LLM with streaming
    const llm = initChatModel({
      provider: llmConfig.provider,
      model: llmConfig.model,
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.maxTokens,
      streaming: llmConfig.streaming !== false, // Default to true
    });

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
      const { tools, cleanup, failedServers } = await progressivelyInitializeMcpServers(
        mcpServersConfig,
        profileUuid,
        {
          logger,
          perServerTimeout: 20000, // 20 seconds per server (configurable)
          totalTimeout: 60000 // 60 seconds total (configurable)
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
      const agent = createReactAgent({
        llm,
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

    // Track streaming state for partial message updates
    let currentAiMessage = '';
    let isFirstToken = true;

    // Execute query with streaming enabled (using finalQuery which may include RAG context)
    const agentFinalState = await session.agent.invoke(
      { messages: [new HumanMessage(finalQuery)] },
      {
        configurable: { thread_id: profileUuid },
        callbacks: [
          {
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
    const lastMessage = agentFinalState.messages[agentFinalState.messages.length - 1];
    if (lastMessage instanceof AIMessage) {
      result = safeProcessContent(lastMessage.content);
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

    // Store the messages in the session for persistence
    session.messages = messages;

    return {
      success: true,
      result,
      messages,
      debug: {
        messageCount: agentFinalState.messages.length,
        messageTypes: agentFinalState.messages.map((m: any) => m.constructor.name),
        lastMessageContentType: typeof agentFinalState.messages[agentFinalState.messages.length - 1].content
      }
    };
  } catch (error) {
    console.error('Error executing playground query:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
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
