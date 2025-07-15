import { getMcpServerByUuid } from '@/app/actions/mcp-servers';
import { McpServer } from '@/types/mcp-server';

import { listPromptsFromServer, listResourcesFromServer, listResourceTemplatesFromServer, listToolsFromServer } from '../client-wrapper';
import { getSessionManager } from '../sessions/SessionManager';
import { MpcSession } from '../sessions/types';

interface StreamableHTTPRequestOptions {
  method: 'POST' | 'GET' | 'DELETE';
  sessionId: string | null;
  userId: string;
  body?: any;
  headers: Record<string, string>;
  streamController?: ReadableStreamDefaultController;
  encoder?: TextEncoder;
}

interface StreamableHTTPResponse {
  success: boolean;
  body?: any;
  status?: number;
  sessionId?: string;
  error?: string;
}

/**
 * Main handler for Streamable HTTP requests
 * Manages sessions and routes requests to appropriate MCP servers
 */
export async function handleStreamableHTTPRequest(
  options: StreamableHTTPRequestOptions
): Promise<StreamableHTTPResponse> {
  const sessionManager = getSessionManager();

  try {
    // Handle POST requests (JSON-RPC messages)
    if (options.method === 'POST') {
      // If no session ID, this might be an initialize request
      if (!options.sessionId && options.body?.method === 'initialize') {
        return handleInitializeRequest(options);
      }

      // For other requests, we need a valid session
      if (!options.sessionId) {
        return {
          success: false,
          status: 400,
          body: {
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: 'Missing Mcp-Session-Id header',
            },
            id: options.body?.id || null,
          },
        };
      }

      // Get the session
      const session = await sessionManager.getSession(options.sessionId);
      if (!session) {
        return {
          success: false,
          status: 400,
          body: {
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: 'Invalid or expired session',
            },
            id: options.body?.id || null,
          },
        };
      }

      // Route the request based on the method
      return await routeJsonRpcRequest(session, options);
    }

    // Handle GET requests (SSE stream)
    if (options.method === 'GET') {
      if (!options.sessionId) {
        return {
          success: false,
          error: 'Missing session ID for SSE stream',
        };
      }

      const session = await sessionManager.getSession(options.sessionId);
      if (!session) {
        return {
          success: false,
          error: 'Invalid or expired session',
        };
      }

      // Set up SSE stream for this session
      // In a real implementation, this would subscribe to server events
      // For now, we'll just indicate success
      return {
        success: true,
      };
    }

    // Handle DELETE requests (session cleanup)
    if (options.method === 'DELETE') {
      if (options.sessionId) {
        await sessionManager.deleteSession(options.sessionId);
      }
      return {
        success: true,
      };
    }

    return {
      success: false,
      status: 405,
      error: 'Method not allowed',
    };
  } catch (error) {
    console.error('[StreamableHTTP Handler] Error:', error);
    return {
      success: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Internal server error',
    };
  }
}

/**
 * Handle initialize requests and create new sessions
 */
async function handleInitializeRequest(
  options: StreamableHTTPRequestOptions
): Promise<StreamableHTTPResponse> {
  try {
    // Extract server identifier from request
    // This could be from a header or the request body
    const serverUuid = options.headers['x-mcp-server-uuid'] || options.body?.params?.serverUuid;
    
    if (!serverUuid) {
      return {
        success: false,
        status: 400,
        body: {
          jsonrpc: '2.0',
          error: {
            code: -32602,
            message: 'Missing server UUID',
          },
          id: options.body?.id || null,
        },
      };
    }

    // For initialization, we need to get the server without profile UUID
    // This is a limitation - we may need to pass profile UUID in headers or create a lookup method
    // For now, let's use a temporary approach and require profile UUID in headers
    const profileUuid = options.headers['x-mcp-profile-uuid'];
    
    if (!profileUuid) {
      return {
        success: false,
        status: 400,
        body: {
          jsonrpc: '2.0',
          error: {
            code: -32602,
            message: 'Missing profile UUID',
          },
          id: options.body?.id || null,
        },
      };
    }

    // Get the server configuration
    const server = await getMcpServerByUuid(profileUuid, serverUuid);
    if (!server) {
      return {
        success: false,
        status: 404,
        body: {
          jsonrpc: '2.0',
          error: {
            code: -32602,
            message: 'Server not found',
          },
          id: options.body?.id || null,
        },
      };
    }

    // Create a new session
    const sessionManager = getSessionManager();
    const sessionId = await sessionManager.createSession(
      server.uuid,
      server.profile_uuid
    );

    // Return successful initialization response
    return {
      success: true,
      sessionId,
      body: {
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
          },
          serverInfo: {
            name: 'Plugged.in MCP Proxy',
            version: '1.0.0',
          },
        },
        id: options.body?.id || null,
      },
    };
  } catch (error) {
    console.error('[StreamableHTTP Handler] Initialize error:', error);
    return {
      success: false,
      status: 500,
      body: {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error during initialization',
        },
        id: options.body?.id || null,
      },
    };
  }
}

/**
 * Route JSON-RPC requests to appropriate handlers
 */
async function routeJsonRpcRequest(
  session: MpcSession,
  options: StreamableHTTPRequestOptions
): Promise<StreamableHTTPResponse> {
  const { method, id } = options.body || {};

  try {
    // Get the server configuration - getMcpServerByUuid needs profileUuid
    const server = await getMcpServerByUuid(session.profile_uuid, session.server_uuid);
    if (!server) {
      return {
        success: false,
        status: 404,
        body: {
          jsonrpc: '2.0',
          error: {
            code: -32602,
            message: 'Server configuration not found',
          },
          id,
        },
      };
    }

    // Route based on method
    switch (method) {
      case 'tools/list':
        return await handleToolsList(server, id);
      
      case 'resources/list':
        return await handleResourcesList(server, id);
      
      case 'resources/templates/list':
        return await handleResourceTemplatesList(server, id);
      
      case 'prompts/list':
        return await handlePromptsList(server, id);
      
      // Add more method handlers as needed
      
      default:
        return {
          success: false,
          status: 404,
          body: {
            jsonrpc: '2.0',
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
            id,
          },
        };
    }
  } catch (error) {
    console.error('[StreamableHTTP Handler] Route error:', error);
    return {
      success: false,
      status: 500,
      body: {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
        },
        id,
      },
    };
  }
}

/**
 * Handle tools/list requests
 */
async function handleToolsList(server: McpServer, id: any): Promise<StreamableHTTPResponse> {
  try {
    const tools = await listToolsFromServer(server);
    return {
      success: true,
      body: {
        jsonrpc: '2.0',
        result: {
          tools,
        },
        id,
      },
    };
  } catch (_error) {
    return {
      success: false,
      body: {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Failed to list tools',
        },
        id,
      },
    };
  }
}

/**
 * Handle resources/list requests
 */
async function handleResourcesList(server: McpServer, id: any): Promise<StreamableHTTPResponse> {
  try {
    const resources = await listResourcesFromServer(server);
    return {
      success: true,
      body: {
        jsonrpc: '2.0',
        result: {
          resources,
        },
        id,
      },
    };
  } catch (_error) {
    return {
      success: false,
      body: {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Failed to list resources',
        },
        id,
      },
    };
  }
}

/**
 * Handle resources/templates/list requests
 */
async function handleResourceTemplatesList(server: McpServer, id: any): Promise<StreamableHTTPResponse> {
  try {
    const resourceTemplates = await listResourceTemplatesFromServer(server);
    return {
      success: true,
      body: {
        jsonrpc: '2.0',
        result: {
          resourceTemplates,
        },
        id,
      },
    };
  } catch (_error) {
    return {
      success: false,
      body: {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Failed to list resource templates',
        },
        id,
      },
    };
  }
}

/**
 * Handle prompts/list requests
 */
async function handlePromptsList(server: McpServer, id: any): Promise<StreamableHTTPResponse> {
  try {
    const prompts = await listPromptsFromServer(server);
    return {
      success: true,
      body: {
        jsonrpc: '2.0',
        result: {
          prompts,
        },
        id,
      },
    };
  } catch (_error) {
    return {
      success: false,
      body: {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Failed to list prompts',
        },
        id,
      },
    };
  }
}