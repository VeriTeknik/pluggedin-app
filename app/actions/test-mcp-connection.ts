'use server';

import { McpServerType } from '@/db/schema';
import { validateHeaders } from '@/lib/security/validators';

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
    // For URL-based servers (SSE and Streamable HTTP)
    if (config.url && (config.type === McpServerType.SSE || config.type === McpServerType.STREAMABLE_HTTP)) {
      // Try to make a HEAD request to check if the endpoint is reachable
      let headers: HeadersInit = {
        'User-Agent': 'Plugged.in MCP Client',
      };
      
      // Validate and add custom headers if provided
      if (config.streamableHTTPOptions?.headers) {
        const headerValidation = validateHeaders(config.streamableHTTPOptions.headers);
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

      // Check for known MCP endpoints first
      let isKnownMcpEndpoint = false;
      let hostname = '';
      
      try {
        const urlObj = new URL(config.url);
        hostname = urlObj.hostname.toLowerCase();
        isKnownMcpEndpoint = hostname === 'mcp.context7.com' || 
                             hostname === 'server.smithery.ai' ||
                             hostname === 'api.githubcopilot.com';
      } catch {
        // Invalid URL, continue with regular flow
      }

      // For known MCP endpoints with Streamable HTTP, skip HEAD and go directly to POST
      if (config.type === McpServerType.STREAMABLE_HTTP && isKnownMcpEndpoint) {
        // Context7 requires special headers for SSE streaming
        if (hostname === 'mcp.context7.com') {
          headers = {
            ...headers,
            'Accept': 'application/json, text/event-stream',
          };
        }
        try {
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
            const corsDetails = await checkForCorsIssue(initResponse.clone(), config.url, responseText);
            
            // Check if this is a 401 authentication error
            const requiresAuth = initResponse.status === 401;
            
            return {
              success: false,
              message: requiresAuth ? 'Authentication required' : `Server returned HTTP ${initResponse.status}`,
              details: {
                error: `HTTP ${initResponse.status}: ${initResponse.statusText}${responseText ? ` - ${responseText}` : ''}`,
                requiresAuth,
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