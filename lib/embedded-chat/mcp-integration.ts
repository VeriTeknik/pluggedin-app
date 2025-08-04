import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { embeddedChatsTable, projectsTable } from '@/db/schema';
import { z } from 'zod';

interface MCPChatConfig {
  projectUuid: string;
  apiKey: string;
  customInstructions?: string;
  enableRag?: boolean;
}

interface MCPResponse {
  content: string;
  error?: string;
}

/**
 * Connects to the pluggedin-mcp proxy server and sends a chat message
 * The proxy server aggregates all MCP servers configured for the user's project
 */
export async function sendMessageToMCPProxy(
  message: string,
  config: MCPChatConfig,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<MCPResponse> {
  let client: Client | null = null;
  let transport: StdioClientTransport | null = null;

  try {
    // Create the MCP client configuration
    const clientInfo = {
      name: 'PluggedinEmbeddedChat',
      version: '1.0.0'
    };

    // Create the transport to connect to pluggedin-mcp proxy
    // The proxy runs as an npx command that connects to the plugged.in API
    transport = new StdioClientTransport({
      command: 'npx',
      args: ['@pluggedin/pluggedin-mcp-proxy@latest'],
      env: {
        ...process.env,
        PLUGGEDIN_API_KEY: config.apiKey,
        // Optional: Set profile if needed
        // PLUGGEDIN_PROFILE: config.profileUuid
      }
    });

    // Create and connect the client
    client = new Client(clientInfo, {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      }
    });

    await client.connect(transport);

    // Build the conversation context
    let fullContext = '';
    
    // Add custom instructions if provided
    if (config.customInstructions) {
      fullContext += `System Instructions:\n${config.customInstructions}\n\n`;
    }
    
    // Add conversation history if provided
    if (conversationHistory && conversationHistory.length > 0) {
      fullContext += 'Previous conversation:\n';
      conversationHistory.forEach(msg => {
        fullContext += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
      });
      fullContext += '\n';
    }
    
    // Add the current message
    fullContext += `User: ${message}\n`;
    fullContext += 'Assistant: ';

    // If RAG is enabled, first query the document library
    if (config.enableRag) {
      try {
        const ragResult = await client.request(
          {
            method: 'tools/call',
            params: {
              name: 'pluggedin_rag_query',
              arguments: {
                query: message
              }
            }
          },
          CallToolResultSchema
        );

        if (ragResult.content && ragResult.content.length > 0) {
          // Add RAG context to the message
          const ragContent = ragResult.content
            .map(c => c.type === 'text' ? c.text : '')
            .join('\n');
          
          if (ragContent) {
            fullContext = `Context from documents:\n${ragContent}\n\n${fullContext}`;
          }
        }
      } catch (ragError) {
        // RAG query failed, continue without it
        console.warn('RAG query failed:', ragError);
      }
    }

    // Now send the message to get a response
    // We'll use a generic completion tool if available
    // First, list available tools to find the best one
    const toolsResult = await client.request(
      { method: 'tools/list', params: {} },
      z.object({ tools: z.array(z.any()) })
    );

    // Look for a chat or completion tool
    let chatToolName: string | null = null;
    const tools = toolsResult.tools || [];
    
    // Priority order for tool selection
    const toolPriorities = [
      'chat', 'complete', 'generate', 'ask', 'query', 'prompt'
    ];
    
    for (const priority of toolPriorities) {
      const tool = tools.find((t: any) => 
        t.name.toLowerCase().includes(priority)
      );
      if (tool) {
        chatToolName = tool.name;
        break;
      }
    }

    // If no specific chat tool found, try using the first available tool
    if (!chatToolName && tools.length > 0) {
      chatToolName = tools[0].name;
    }

    if (!chatToolName) {
      // No tools available, return a fallback response
      return {
        content: "I'm sorry, but I don't have any AI models configured to respond. Please contact the administrator to set up MCP servers.",
        error: 'No chat tools available'
      };
    }

    // Call the chat tool
    const response = await client.request(
      {
        method: 'tools/call',
        params: {
          name: chatToolName,
          arguments: {
            message: fullContext,
            // Some tools might expect different parameter names
            prompt: fullContext,
            query: fullContext,
            text: fullContext,
            input: fullContext
          }
        }
      },
      CallToolResultSchema
    );

    // Extract the response content
    const responseContent = response.content
      ?.map(c => c.type === 'text' ? c.text : '')
      .join('\n') || 'I apologize, but I couldn\'t generate a response.';

    return {
      content: responseContent
    };

  } catch (error) {
    console.error('MCP proxy error:', error);
    
    // Provide a user-friendly error message
    let errorMessage = 'I encountered an error while processing your message.';
    
    if (error instanceof Error) {
      if (error.message.includes('PLUGGEDIN_API_KEY')) {
        errorMessage = 'Authentication failed. Please check your API key configuration.';
      } else if (error.message.includes('connect')) {
        errorMessage = 'Unable to connect to the AI service. Please try again later.';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'The request timed out. Please try again.';
      }
    }
    
    return {
      content: errorMessage,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  } finally {
    // Clean up connections
    try {
      if (client) {
        await client.close();
      }
      if (transport) {
        await transport.close();
      }
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError);
    }
  }
}

/**
 * Alternative approach: Direct HTTP communication with pluggedin-mcp if it's running as HTTP server
 */
export async function sendMessageViaHTTP(
  message: string,
  config: MCPChatConfig,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<MCPResponse> {
  try {
    // This assumes pluggedin-mcp is running as an HTTP server on port 12006
    const response = await fetch('http://localhost:12006/mcp/v1/tools/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'chat',
          arguments: {
            message,
            context: conversationHistory,
            instructions: config.customInstructions,
            enableRag: config.enableRag
          }
        },
        id: Date.now()
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message || 'Unknown error');
    }

    const content = data.result?.content
      ?.map((c: any) => c.type === 'text' ? c.text : '')
      .join('\n') || 'No response generated';

    return {
      content
    };
  } catch (error) {
    console.error('HTTP MCP error:', error);
    return {
      content: 'Unable to connect to the AI service. Please try again later.',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}