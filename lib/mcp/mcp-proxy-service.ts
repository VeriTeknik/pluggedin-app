import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { McpServerType } from '@/db/schema';

/**
 * MCP Proxy Service for executing tools on MCP servers
 * Uses the sandboxed client-wrapper for security
 */
export class MCPProxyService {
  private static instance: MCPProxyService;

  private constructor() {}

  static getInstance(): MCPProxyService {
    if (!MCPProxyService.instance) {
      MCPProxyService.instance = new MCPProxyService();
    }
    return MCPProxyService.instance;
  }

  /**
   * Execute a tool on an MCP server
   */
  async executeTool(
    serverConfig: any,
    toolName: string,
    args: Record<string, any>
  ): Promise<CallToolResult> {
    try {
      // Handle STDIO and SSE servers via sandboxed client-wrapper
      if (serverConfig.type === McpServerType.STDIO || serverConfig.type === McpServerType.SSE) {
        // Import and use the sandboxed callToolOnServer function
        const { callToolOnServer } = await import('./client-wrapper');
        
        try {
          const result = await callToolOnServer(serverConfig, toolName, args);
          
          // Format the result as CallToolResult
          if (result && typeof result === 'object') {
            if (result.content) {
              return { content: result.content };
            }
            if (result.error) {
              return {
                content: [
                  {
                    type: 'text',
                    text: result.error,
                  },
                ],
                isError: true,
              };
            }
            // Default format
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }
          
          return {
            content: [
              {
                type: 'text',
                text: String(result),
              },
            ],
          };
        } catch (toolError) {
          console.error('Error calling tool on MCP server:', toolError);
          return {
            content: [
              {
                type: 'text',
                text: `Error executing tool: ${toolError instanceof Error ? toolError.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }
      }
      
      // Extract server configuration for HTTP-based servers
      const config = serverConfig.config as any;
      
      // Check if this is a pluggedin-mcp proxy server
      if (config && config.baseUrl && config.baseUrl.includes('plugged.in')) {
        // Use the pluggedin-mcp API format
        const baseUrl = config.baseUrl || process.env.PLUGGEDIN_API_BASE_URL || 'https://api.plugged.in';
        const apiKey = config.apiKey || process.env.PLUGGEDIN_API_KEY || '';
        
        // Construct the tool execution URL for pluggedin-mcp
        const url = `${baseUrl}/api/v1/call-tool`;
        
        // Make the request to execute the tool
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            toolName: toolName,
            arguments: args,
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Tool execution failed: ${response.status} ${errorText}`);
        }
        
        const result = await response.json();
        
        // Format the result as CallToolResult
        if (result.error) {
          return {
            content: [
              {
                type: 'text',
                text: result.error,
              },
            ],
            isError: true,
          };
        }
        
        // Handle different result formats
        if (typeof result === 'string') {
          return {
            content: [
              {
                type: 'text',
                text: result,
              },
            ],
          };
        }
        
        if (result.content) {
          return {
            content: result.content,
          };
        }
        
        // Handle pluggedin-mcp result format
        if (result.result) {
          if (typeof result.result === 'string') {
            return {
              content: [
                {
                  type: 'text',
                  text: result.result,
                },
              ],
            };
          }
          if (result.result.content) {
            return {
              content: result.result.content,
            };
          }
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result.result, null, 2),
              },
            ],
          };
        }
        
        // Default formatting
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } else {
        // For non-pluggedin servers, we need a different approach
        // This would require implementing actual MCP client connections
        return {
          content: [
            {
              type: 'text',
              text: `Tool execution for non-pluggedin servers is not yet implemented`,
            },
          ],
          isError: true,
        };
      }
    } catch (error) {
      console.error('Error executing tool via MCP proxy:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * List tools available on an MCP server
   */
  async listTools(serverConfig: any): Promise<any[]> {
    try {
      const config = serverConfig.config as any;
      const baseUrl = config.baseUrl || process.env.PLUGGEDIN_API_BASE_URL || 'https://api.plugged.in';
      const apiKey = config.apiKey || process.env.PLUGGEDIN_API_KEY || '';
      
      const url = `${baseUrl}/v1/tools`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'X-Server-UUID': serverConfig.uuid,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to list tools: ${response.status}`);
      }
      
      const result = await response.json();
      return result.tools || [];
    } catch (error) {
      console.error('Error listing tools:', error);
      return [];
    }
  }
}