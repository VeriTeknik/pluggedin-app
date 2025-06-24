'use server';

import { McpServerType } from '@/db/schema';

interface TestConfig {
  name: string;
  type: McpServerType;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  streamableHTTPOptions?: {
    headers?: Record<string, string>;
    sessionId?: string;
  };
}

interface TestResult {
  success: boolean;
  message: string;
  details?: {
    capabilities?: string[];
    error?: string;
  };
}

export async function testMcpConnection(config: TestConfig): Promise<TestResult> {
  try {
    // For URL-based servers (SSE and Streamable HTTP)
    if (config.url && (config.type === McpServerType.SSE || config.type === McpServerType.STREAMABLE_HTTP)) {
      // Try to make a HEAD request to check if the endpoint is reachable
      const headers: HeadersInit = {
        'User-Agent': 'Plugged.in MCP Client',
        ...config.streamableHTTPOptions?.headers,
      };

      try {
        // For known MCP endpoints that support POST, try the initialize method
        let shouldTryInitialize = config.type === McpServerType.STREAMABLE_HTTP;
        
        // Check for known MCP endpoints using proper URL parsing
        if (!shouldTryInitialize) {
          try {
            const urlObj = new URL(config.url);
            const hostname = urlObj.hostname.toLowerCase();
            shouldTryInitialize = hostname === 'mcp.context7.com' || hostname === 'server.smithery.ai';
          } catch {
            // Invalid URL, skip initialization attempt
          }
        }
        
        if (shouldTryInitialize) {
          
          // Try to send an initialize request
          const initResponse = await fetch(config.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...headers,
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'initialize',
              params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: {
                  name: 'pluggedin-test',
                  version: '1.0.0'
                }
              },
              id: 1
            }),
            signal: AbortSignal.timeout(5000),
          });

          if (initResponse.ok) {
            const data = await initResponse.json();
            return {
              success: true,
              message: 'MCP server connection verified',
              details: {
                capabilities: data.result?.capabilities ? Object.keys(data.result.capabilities) : ['Server initialized'],
              },
            };
          }
        }

        // Fallback to HEAD request
        const response = await fetch(config.url, {
          method: 'HEAD',
          headers,
          signal: AbortSignal.timeout(5000), // 5 second timeout
        });

        if (response.ok || response.status === 405) { // 405 Method Not Allowed is OK for HEAD
          return {
            success: true,
            message: `Connection successful (HTTP ${response.status})`,
            details: {
              capabilities: ['Connection verified'],
            },
          };
        } else {
          return {
            success: false,
            message: `Server returned HTTP ${response.status}`,
            details: {
              error: `HTTP ${response.status}: ${response.statusText}`,
            },
          };
        }
      } catch (fetchError) {
        // If HEAD fails, try OPTIONS as a fallback
        try {
          const optionsResponse = await fetch(config.url, {
            method: 'OPTIONS',
            headers,
            signal: AbortSignal.timeout(5000),
          });

          if (optionsResponse.ok) {
            return {
              success: true,
              message: 'Connection successful (OPTIONS)',
              details: {
                capabilities: ['Connection verified via OPTIONS'],
              },
            };
          }
        } catch {
          // OPTIONS also failed
        }

        return {
          success: false,
          message: 'Failed to connect to server',
          details: {
            error: fetchError instanceof Error ? fetchError.message : 'Connection failed',
          },
        };
      }
    }

    // For STDIO servers
    if (config.command && config.type === McpServerType.STDIO) {
      // Check if the command exists
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execPromise = promisify(exec);

      try {
        // Try to check if the command is available
        const checkCommand = config.command === 'npx' ? 'npx --version' : `which ${config.command}`;
        await execPromise(checkCommand);

        // If it's npx with a package, we can't easily verify without installing
        if (config.command === 'npx' && config.args?.[0]) {
          return {
            success: true,
            message: 'Command available (npx package will be installed on first use)',
            details: {
              capabilities: ['Command verified'],
            },
          };
        }

        return {
          success: true,
          message: 'Command available',
          details: {
            capabilities: ['Command verified'],
          },
        };
      } catch (_error) {
        return {
          success: false,
          message: 'Command not found',
          details: {
            error: `Command '${config.command}' not found in PATH`,
          },
        };
      }
    }

    return {
      success: false,
      message: 'Invalid configuration',
      details: {
        error: 'Missing required fields for server type',
      },
    };
  } catch (error) {
    return {
      success: false,
      message: 'Test failed',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}