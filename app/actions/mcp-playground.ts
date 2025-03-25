'use server';

import { ChatAnthropic } from '@langchain/anthropic';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';

import { getMcpServers } from '@/app/actions/mcp-servers';
import { convertMcpToLangchainTools, McpServerCleanupFn } from '@/lib/langchain-mcp-tools-ts/dist/';

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
    } catch (e) {
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
    } catch (e) {
      return `[Complex object: ${Object.keys(content).join(', ')}]`;
    }
  }
  
  // For any other types
  return String(content);
}

// Initialize chat model based on provider
function initChatModel(config: {
  provider: 'openai' | 'anthropic';
  model: string;
  temperature?: number;
  maxTokens?: number;
}) {
  const { provider, model, temperature = 0, maxTokens } = config;
  
  if (provider === 'openai') {
    return new ChatOpenAI({
      modelName: model,
      temperature,
      maxTokens,
    });
  } else if (provider === 'anthropic') {
    return new ChatAnthropic({
      modelName: model,
      temperature,
      maxTokens,
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

// Get or create a playground session for a profile
export async function getOrCreatePlaygroundSession(
  profileUuid: string,
  selectedServerUuids: string[],
  llmConfig: {
    provider: 'openai' | 'anthropic';
    model: string;
    temperature?: number;
    maxTokens?: number;
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
    // Get all MCP servers for the profile
    const allServers = await getMcpServers(profileUuid);
    
    // Filter servers based on selected UUIDs
    const selectedServers = allServers.filter(server => 
      selectedServerUuids.includes(server.uuid)
    );
    
    // Format servers for conversion
    const mcpServersConfig: Record<string, any> = {};
    selectedServers.forEach(server => {
      mcpServersConfig[server.name] = {
        command: server.command,
        args: server.args,
        env: server.env,
        url: server.url,
        type: server.type
      };
    });
    
    // Initialize LLM
    const llm = initChatModel(llmConfig);
    
    // Convert MCP servers to LangChain tools
    const { tools, cleanup } = await convertMcpToLangchainTools(
      mcpServersConfig,
      { logLevel: 'info' }
    );

    
    
    // Create agent
    const agent = createReactAgent({
      llm,
      tools,
      checkpointSaver: new MemorySaver(),
    });
    
    // Store session
    activeSessions.set(profileUuid, {
      agent,
      cleanup,
      lastActive: new Date()
    });
    
    return { success: true };
  } catch (error) {
    console.error('Failed to create playground session:', error);
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
    
    // Execute query
    const agentFinalState = await session.agent.invoke(
      { messages: [new HumanMessage(query)] },
      { configurable: { thread_id: profileUuid } }
    );
    
    // Process the result
    let result: string;
    const lastMessage = agentFinalState.messages[agentFinalState.messages.length - 1];
    if (lastMessage instanceof AIMessage) {
      result = safeProcessContent(lastMessage.content);
    } else {
      result = safeProcessContent(lastMessage.content);
    }
    
    // Get all messages for display with debugging information
    const messages = agentFinalState.messages.map((message: any, index: number) => {
      // Add debugging information
      const contentType = typeof message.content;
      const contentKeys = message.content && typeof message.content === 'object' ? 
        Object.keys(message.content) : [];
      
      const debugInfo = `[DEBUG: Message ${index}, Type: ${message.constructor.name}, Content type: ${contentType}, Keys: ${contentKeys.join(',')}]`;
      
      if (message instanceof HumanMessage) {
        return { 
          role: 'human', 
          content: message.content,
          debug: debugInfo
        };
      } else if (message instanceof AIMessage) {
        return { 
          role: 'ai', 
          content: safeProcessContent(message.content),
          debug: debugInfo
        };
      } else {
        return { 
          role: 'tool', 
          content: safeProcessContent(message.content),
          debug: debugInfo
        };
      }
    });
    
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