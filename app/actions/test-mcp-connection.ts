'use server';

import { z } from 'zod';

import { McpServerType } from '@/db/schema';
import { validateHeaders } from '@/lib/security/validators';

const testConfigSchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(McpServerType),
  url: z.string().optional(), // Not using .url() because it might include localhost URLs
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  streamableHTTPOptions: z.object({
    headers: z.record(z.string(), z.string()).optional(),
    sessionId: z.string().optional(),
  }).optional(),
  transport: z.string().optional(),
});

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
  transport?: string;
}

interface TestResult {
  success: boolean;
  message: string;
  details?: {
    capabilities?: string[];
    error?: string;
    corsIssue?: boolean;
    corsDetails?: string;
    requiresAuth?: boolean;
  };
}

/**
 * Check if a response indicates a CORS issue
 */
async function checkForCorsIssue(response: Response, url: string, responseText?: string): Promise<{ corsIssue?: boolean; corsDetails?: string }> {
  // Check if this is a 400 Bad Request that might be session-related
  if (response.status === 400 && responseText) {
    if (responseText.includes('session') || responseText.includes('Session-Id') || responseText.includes('Mcp-Session-Id')) {
      return {
        corsIssue: true,
        corsDetails: 'Server requires session ID but may not have proper CORS headers. The server should include "Access-Control-Expose-Headers: Mcp-Session-Id" to allow the client to read the session ID.',
      };
    }
  }

  // Check if the server is missing CORS headers entirely
  const accessControlAllowOrigin = response.headers.get('Access-Control-Allow-Origin');
  const accessControlExposeHeaders = response.headers.get('Access-Control-Expose-Headers');
  
  if (!accessControlAllowOrigin) {
    return {
      corsIssue: true,
      corsDetails: 'Server is missing Access-Control-Allow-Origin header. The server needs to configure CORS to allow requests from web clients.',
    };
  }

  // Check if Mcp-Session-Id is exposed for Streamable HTTP
  if (!accessControlExposeHeaders?.includes('Mcp-Session-Id')) {
    return {
      corsIssue: true,
      corsDetails: 'Server does not expose Mcp-Session-Id header. Add "Access-Control-Expose-Headers: Mcp-Session-Id" to the server\'s CORS configuration.',
    };
  }

  return {};
}

/**
 * Check if a network error might be CORS-related
 */
function checkForCorsNetworkError(error: unknown): { corsIssue?: boolean; corsDetails?: string } {
  if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
    return {
      corsIssue: true,
      corsDetails: 'Network error (possibly CORS). This often happens when the server doesn\'t allow cross-origin requests. Check the server\'s CORS configuration.',
    };
  }

  // Check for other common CORS error patterns
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (errorMessage.includes('cors') || errorMessage.includes('cross-origin') || errorMessage.includes('blocked')) {
    return {
      corsIssue: true,
      corsDetails: 'CORS error detected. The server needs to configure proper CORS headers to allow requests from web clients.',
    };
  }

  return {};
}

export async function testMcpConnection(config: TestConfig): Promise<TestResult> {
  try {
    // Validate input
    const validated = testConfigSchema.parse(config);
    // Special handling for mcp-remote servers (servers that proxy to remote URLs)
    const isMcpRemote = (validated.command === 'npx' && validated.args?.includes('mcp-remote')) ||
                        validated.transport === 'mcp-remote';
    
    if (isMcpRemote) {
      // For mcp-remote servers, we need to test the remote URL
      let remoteUrl = validated.url;
      
      // If URL not directly available, find it in args
      if (!remoteUrl && validated.args) {
        const urlIndex = validated.args.findIndex(arg => arg.includes('http'));
        if (urlIndex !== -1) {
          remoteUrl = validated.args[urlIndex];
        }
      }
      
      if (remoteUrl) {
        
        // Test the remote URL to see if it needs authentication
        try {
          const response = await fetch(remoteUrl, {
            method: 'HEAD',
            headers: {
              'User-Agent': 'Plugged.in MCP Client',
            },
            signal: AbortSignal.timeout(5000),
          });
          
          if (response.status === 401) {
            return {
              success: true, // The server is reachable, just needs auth
              message: 'This server requires authentication. After adding it, you\'ll see an "Authenticate" button to connect your account.',
              details: {
                requiresAuth: true,
                error: 'Authentication is required to use this server. The server is reachable but needs you to authenticate first.',
                capabilities: ['Server verified - authentication required'],
              },
            };
          } else if (response.ok || response.status === 405) {
            return {
              success: true,
              message: 'mcp-remote proxy server verified',
              details: {
                capabilities: ['Remote server connection verified'],
              },
            };
          } else {
            return {
              success: false,
              message: `Remote server returned HTTP ${response.status}`,
              details: {
                error: `HTTP ${response.status}: ${response.statusText}`,
              },
            };
          }
        } catch (_error) {
          // If we can't reach the remote URL, still pass since mcp-remote will handle it
          return {
            success: true,
            message: 'mcp-remote command available (remote connection will be tested on use)',
            details: {
              capabilities: ['mcp-remote proxy available'],
            },
          };
        }
      }
    }
    
    // For URL-based servers (SSE and Streamable HTTP)
    if (validated.url && (validated.type === McpServerType.SSE || validated.type === McpServerType.STREAMABLE_HTTP)) {
      // Try to make a HEAD request to check if the endpoint is reachable
      let headers: HeadersInit = {
        'User-Agent': 'Plugged.in MCP Client',
      };
      
      // Validate and add custom headers if provided
      if (validated.streamableHTTPOptions?.headers) {
        const headerValidation = validateHeaders(validated.streamableHTTPOptions.headers);
        if (!headerValidation.valid) {
          return {
            success: false,
            message: 'Invalid headers provided',
            details: {
              error: headerValidation.error,
            },
          };
        }
        headers = {
          ...headers,
          ...headerValidation.sanitizedHeaders,
        };
      }

      // For all Streamable HTTP servers, try to send an initialize request
      // This is the proper way to test MCP servers
      if (validated.type === McpServerType.STREAMABLE_HTTP) {
        // Add MCP-compatible headers
        headers = {
          ...headers,
          'Accept': 'application/json, text/event-stream',
        };
        try {
          // Try to send an initialize request
          const initResponse = await fetch(validated.url, {
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
            const contentType = initResponse.headers.get('content-type') || '';
            
            // Handle SSE responses
            if (contentType.includes('text/event-stream')) {
              const text = await initResponse.text();
              // Parse SSE format: extract JSON from "data:" lines
              const dataMatch = text.match(/data:\s*({.*})/);
              if (dataMatch) {
                try {
                  const data = JSON.parse(dataMatch[1]);
                  return {
                    success: true,
                    message: 'MCP server connection verified',
                    details: {
                      capabilities: data.result?.capabilities ? Object.keys(data.result.capabilities) : ['Server initialized'],
                    },
                  };
                } catch (parseError) {
                  return {
                    success: false,
                    message: 'Failed to parse server response',
                    details: {
                      error: parseError instanceof Error ? parseError.message : 'Invalid SSE response format',
                    },
                  };
                }
              } else {
                return {
                  success: false,
                  message: 'Invalid SSE response format',
                  details: {
                    error: 'No data field found in SSE response',
                  },
                };
              }
            }
            
            // Standard JSON response handling
            const data = await initResponse.json();
            return {
              success: true,
              message: 'MCP server connection verified',
              details: {
                capabilities: data.result?.capabilities ? Object.keys(data.result.capabilities) : ['Server initialized'],
              },
            };
          } else {
            // Try to read response body for CORS checking
            let responseText = '';
            try {
              responseText = await initResponse.text();
            } catch {
              // Ignore errors reading response body
            }
            
            // Check for CORS issues
            const corsDetails = await checkForCorsIssue(initResponse.clone(), validated.url, responseText);
            
            // Check if this is a 401 authentication error
            const requiresAuth = initResponse.status === 401;
            
            if (requiresAuth) {
              return {
                success: true, // The server is reachable, just needs auth
                message: 'This server requires authentication. After adding it, you\'ll see an "Authenticate" button to connect your account.',
                details: {
                  requiresAuth: true,
                  error: 'Authentication is required to use this server. The server is reachable but needs you to authenticate first.',
                  capabilities: ['Server verified - authentication required'],
                  ...corsDetails,
                },
              };
            }
            
            return {
              success: false,
              message: `Server returned HTTP ${initResponse.status}`,
              details: {
                error: `HTTP ${initResponse.status}: ${initResponse.statusText}${responseText ? ` - ${responseText}` : ''}`,
                requiresAuth: false,
                ...corsDetails,
              },
            };
          }
        } catch (error) {
          // Check if it's a network error that might be CORS-related
          const corsDetails = checkForCorsNetworkError(error);
          
          return {
            success: false,
            message: 'Failed to connect to MCP server',
            details: {
              error: error instanceof Error ? error.message : 'Connection failed',
              ...corsDetails,
            },
          };
        }
      }


      // For other servers, try HEAD request first
      try {
        const response = await fetch(validated.url, {
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
          const optionsResponse = await fetch(validated.url, {
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
    if (validated.command && validated.type === McpServerType.STDIO) {
      // Check if the command exists
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execPromise = promisify(exec);

      try {
        // Try to check if the command is available
        const checkCommand = validated.command === 'npx' ? 'npx --version' : `which ${validated.command}`;
        await execPromise(checkCommand);

        // If it's npx with a package, we can't easily verify without installing
        if (validated.command === 'npx' && validated.args?.[0]) {
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
            error: `Command '${validated.command}' not found in PATH`,
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