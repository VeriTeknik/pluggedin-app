'use server';

import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MemorySaver } from '@langchain/langgraph';
import { convertMcpToLangchainTools, McpServerCleanupFn } from '@h1deya/langchain-mcp-tools';

import { getMcpServers } from '@/app/actions/mcp-servers';

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
        messageTypes: agentFinalState.messages.map(m => m.constructor.name),
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