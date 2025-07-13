import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { PackageManagerConfig } from '@/lib/mcp/package-manager/config';

export interface OAuthProcessResult {
  success: boolean;
  token?: string;
  tokenType?: 'bearer' | 'oauth';
  error?: string;
  oauthUrl?: string;
  metadata?: {
    provider?: string;
    expiresAt?: string;
    refreshToken?: string;
    scope?: string;
  };
}

export interface OAuthProcessOptions {
  serverName: string;
  serverUuid?: string;
  serverUrl?: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  timeout?: number;
  callbackPort?: number;
}

/**
 * Generic OAuth Process Manager for MCP servers
 * Handles spawning processes that manage their own OAuth flows
 */
export class OAuthProcessManager extends EventEmitter {
  private processes: Map<string, ChildProcess> = new Map();
  private readonly MCP_AUTH_DIR = path.join(os.homedir(), '.mcp-auth');
  
  constructor() {
    super();
  }

  /**
   * Trigger OAuth flow for a server
   * Works generically for any MCP server that handles OAuth
   */
  async triggerOAuth(options: OAuthProcessOptions): Promise<OAuthProcessResult> {
    const { serverName, serverUuid, command, args, env, timeout = 300000 } = options; // 5 min timeout
    
    try {
      // Create isolated OAuth directory for this server
      let oauthHome: string;
      let isolatedMcpAuthDir: string;
      
      if (serverUuid) {
        // Use server-specific OAuth directory
        oauthHome = path.join(PackageManagerConfig.PACKAGE_STORE_DIR, 'servers', serverUuid, 'oauth');
        await fs.mkdir(oauthHome, { recursive: true });
        isolatedMcpAuthDir = path.join(oauthHome, '.mcp-auth');
      } else {
        // Fallback to default behavior
        oauthHome = os.homedir();
        isolatedMcpAuthDir = this.MCP_AUTH_DIR;
      }
      
      // Ensure .mcp-auth directory exists
      await fs.mkdir(isolatedMcpAuthDir, { recursive: true });
      
      // Kill any existing process for this server
      await this.killProcess(serverName);
      
      // Clear existing OAuth tokens to force fresh authentication
      await this.clearExistingTokens(serverName, isolatedMcpAuthDir);
      
      // Spawn the OAuth process with isolated HOME
      const childProcess = spawn(command, args, {
        env: {
          ...process.env,
          ...env,
          // Use isolated HOME directory to isolate .mcp-auth
          HOME: oauthHome,
          // Ensure OAuth callback port is set if provided
          ...(options.callbackPort && { OAUTH_CALLBACK_PORT: options.callbackPort.toString() })
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      this.processes.set(serverName, childProcess);
      
      // For mcp-remote servers, we need to wait for it to start then trigger a request
      if (args.includes('mcp-remote')) {
        // Wait for the proxy to be established
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Trigger a request to the MCP server to initiate OAuth
        console.log(`[OAuth ${serverName}] mcp-remote proxy established, triggering OAuth flow...`);
        
        // Send a simple request to trigger OAuth (if not already authenticated)
        // This will cause the mcp-remote to output the OAuth URL
        setTimeout(() => {
          try {
            // Send a test request via stdio to trigger OAuth
            childProcess.stdin?.write(JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "tools/list"
            }) + '\n');
            
            // Then try a user-specific request that would require authentication
            setTimeout(() => {
              try {
                childProcess.stdin?.write(JSON.stringify({
                  jsonrpc: "2.0",
                  id: 2,
                  method: "tools/call",
                  params: {
                    name: "list_my_issues",
                    arguments: {}
                  }
                }) + '\n');
              } catch (error) {
                console.error(`[OAuth ${serverName}] Error sending user request:`, error);
              }
            }, 2000);
          } catch (error) {
            console.error(`[OAuth ${serverName}] Error sending test request:`, error);
          }
        }, 1000);
      }
      
      // Set up monitoring with isolated directory
      const result = await this.monitorOAuthProcess(serverName, childProcess, timeout, isolatedMcpAuthDir);
      
      // Clean up
      this.processes.delete(serverName);
      
      return result;
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Monitor OAuth process for completion
   */
  private async monitorOAuthProcess(
    serverName: string,
    process: ChildProcess,
    timeout: number,
    mcpAuthDir: string = this.MCP_AUTH_DIR
  ): Promise<OAuthProcessResult> {
    return new Promise((resolve) => {
      let _output = '';
      let errorOutput = '';
      let tokenFound = false;
      let oauthUrl: string | undefined;
      let oauthUrlFound = false;
      
      // Set timeout
      const timeoutId = setTimeout(() => {
        if (!tokenFound) {
          process.kill();
          resolve({
            success: false,
            error: 'OAuth process timed out'
          });
        }
      }, timeout);
      
      // Monitor stdout for OAuth success indicators
      process.stdout?.on('data', (data) => {
        const chunk = data.toString();
        _output += chunk;
        console.log(`[OAuth ${serverName}] stdout:`, chunk);
        
        // Check for OAuth URLs in stdout responses (JSON-RPC errors) and success detection
        try {
          const jsonResponse = JSON.parse(chunk);
          
          // Check for successful authentication - response to our list_my_issues call
          if (jsonResponse.result && jsonResponse.id === 2) {
            if (jsonResponse.result.content && Array.isArray(jsonResponse.result.content)) {
              const content = jsonResponse.result.content[0];
              if (content && content.type === 'text' && content.text) {
                try {
                  // Try to parse the returned text as JSON (Linear returns stringified JSON)
                  const userData = JSON.parse(content.text);
                  if (Array.isArray(userData) && userData.length > 0 && userData[0].id) {
                    if (oauthUrlFound) {
                      // We got real user data AFTER OAuth flow
                      console.log(`[OAuth ${serverName}] Authentication successful - got user data after OAuth flow`);
                      tokenFound = true;
                      clearTimeout(timeoutId);
                      
                      // Give it more time for the token to be saved
                      setTimeout(async () => {
                        // Try multiple times to find the token
                        let attempts = 0;
                        const maxAttempts = 5;
                        const checkInterval = 1000; // 1 second between attempts
                        
                        const checkForToken = async () => {
                          attempts++;
                          console.log(`[OAuth ${serverName}] Checking for token, attempt ${attempts}/${maxAttempts}`);
                          const tokenData = await this.checkMcpAuthToken(serverName, mcpAuthDir);
                          
                          if (tokenData && tokenData.token) {
                            resolve(tokenData);
                          } else if (attempts < maxAttempts) {
                            setTimeout(checkForToken, checkInterval);
                          } else {
                            // Fallback to success without token - auth is working but we couldn't extract token
                            console.log(`[OAuth ${serverName}] Could not find token after ${maxAttempts} attempts, marking as working`);
                            resolve({
                              success: true,
                              token: 'oauth_working', // Mark that OAuth is working but we don't have token
                              tokenType: 'bearer',
                              metadata: { provider: serverName }
                            });
                          }
                        };
                        
                        await checkForToken();
                      }, 2000); // Initial delay before first check
                      return;
                    } else {
                      // Got user data without OAuth URL - this might be the initial connection
                      console.log(`[OAuth ${serverName}] Got user data - OAuth may have already been completed`);
                      // Mark as success since we can access user data
                      tokenFound = true;
                      clearTimeout(timeoutId);
                      
                      // Try to find existing token
                      setTimeout(async () => {
                        const tokenData = await this.checkMcpAuthToken(serverName, mcpAuthDir);
                        resolve({
                          success: true,
                          token: tokenData?.token || 'oauth_working',
                          tokenType: 'bearer',
                          metadata: { provider: serverName }
                        });
                      }, 1000);
                      return;
                    }
                  }
                } catch (_parseError) {
                  // Content isn't JSON, continue
                }
              }
            }
          }
          
          if (jsonResponse.error) {
            // Check for authentication errors that might contain OAuth URLs
            const errorMessage = jsonResponse.error.message || '';
            const errorData = JSON.stringify(jsonResponse.error.data || {});
            const fullError = errorMessage + ' ' + errorData;
            
            const authUrlMatch = fullError.match(/https:\/\/[^\s"]+\/oauth[^\s"]*/i) ||
                                fullError.match(/https:\/\/linear\.app\/oauth[^\s"]+/i) ||
                                fullError.match(/Visit:\s*(https:\/\/[^\s"]+)/i);
            
            if (authUrlMatch && !oauthUrl) {
              oauthUrl = authUrlMatch[1] || authUrlMatch[0];
              oauthUrlFound = true;
              console.log(`[OAuth ${serverName}] Found OAuth URL in error response:`, oauthUrl);
              
              clearTimeout(timeoutId);
              resolve({
                success: false,
                oauthUrl,
                error: 'User authentication required'
              });
              return;
            }
          }
        } catch (_e) {
          // Not JSON, continue with regular patterns
        }
        
        // Check for common OAuth success patterns
        const tokenPatterns = [
          /oauth.*success/i,
          /authentication.*complete/i,
          /token.*received/i,
          /authorized/i,
          /access_token["\s:]+([A-Za-z0-9\-_]+)/i,
          /Linear API key saved/i,  // Linear specific
          /Authentication successful/i
        ];
        
        for (const pattern of tokenPatterns) {
          const match = chunk.match(pattern);
          if (match) {
            tokenFound = true;
            // Try to extract token if it's in the output
            const tokenMatch = chunk.match(/access_token["\s:]+([A-Za-z0-9\-_]+)/i);
            if (tokenMatch) {
              clearTimeout(timeoutId);
              resolve({
                success: true,
                token: tokenMatch[1],
                tokenType: 'bearer'
              });
              return;
            }
          }
        }
      });
      
      // Monitor stderr
      process.stderr?.on('data', (data) => {
        const chunk = data.toString();
        errorOutput += chunk;
        console.error(`[OAuth ${serverName}] stderr:`, chunk);
        
        // Look for specific mcp-remote OAuth patterns
        if (chunk.includes('Please authorize this client by visiting:') || 
            chunk.includes('https://mcp.linear.app/authorize')) {
          // Extract the OAuth URL
          const urlMatch = chunk.match(/https:\/\/[^\s]+/);
          if (urlMatch && !oauthUrl) {
            oauthUrl = urlMatch[0];
            oauthUrlFound = true;
            console.log(`[OAuth ${serverName}] Found OAuth URL:`, oauthUrl);
            
            // Return immediately with the OAuth URL for the client to handle
            clearTimeout(timeoutId);
            resolve({
              success: false, // Not successful yet, user needs to authenticate
              oauthUrl,
              error: 'User authentication required'
            });
            
            // Keep the process running for token capture
            return; // Exit here, don't continue monitoring
          }
        }
        
        // Check for OAuth completion patterns
        if (chunk.includes('Auth code received') || 
            chunk.includes('Completing authorization') ||
            chunk.includes('Connected to remote server using SSEClientTransport')) {
          console.log(`[OAuth ${serverName}] OAuth completion detected`);
          // Mark that OAuth flow is completing
          oauthUrlFound = true; // We're past the OAuth URL stage
        }
        
        // Also check for Linear-specific OAuth patterns in stderr
        if (chunk.includes('Linear API key saved') || chunk.includes('Authentication successful')) {
          tokenFound = true;
          // Give it a moment to save the token
          setTimeout(async () => {
            const token = await this.checkMcpAuthToken(serverName, mcpAuthDir);
            if (token) {
              clearTimeout(timeoutId);
              resolve(token);
            }
          }, 1000);
        }
      });
      
      // Handle process exit
      process.on('exit', async (code) => {
        clearTimeout(timeoutId);
        
        if (tokenFound || code === 0) {
          // Check for token in .mcp-auth directory
          const token = await this.checkMcpAuthToken(serverName, mcpAuthDir);
          if (token) {
            resolve(token);
            return;
          }
        }
        
        resolve({
          success: false,
          error: `Process exited with code ${code}: ${errorOutput || 'No error output'}`
        });
      });
      
      // Handle process error
      process.on('error', (error) => {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          error: `Process error: ${error.message}`
        });
      });
    });
  }

  /**
   * Check ~/.mcp-auth directory for OAuth tokens
   * Different MCP servers may store tokens in different formats
   */
  private async checkMcpAuthToken(serverName: string, mcpAuthDir: string = this.MCP_AUTH_DIR): Promise<OAuthProcessResult | null> {
    try {
      // First check for mcp-remote subdirectory structure
      try {
        const entries = await fs.readdir(mcpAuthDir);
        
        // Look for mcp-remote-* directories
        for (const entry of entries) {
          if (entry.startsWith('mcp-remote-')) {
            const subDir = path.join(mcpAuthDir, entry);
            const stat = await fs.stat(subDir);
            
            if (stat.isDirectory()) {
              const files = await fs.readdir(subDir);
              
              // Look for *_tokens.json files
              for (const file of files) {
                if (file.endsWith('_tokens.json')) {
                  const filepath = path.join(subDir, file);
                  try {
                    const content = await fs.readFile(filepath, 'utf-8');
                    const data = JSON.parse(content);
                    
                    // mcp-remote stores tokens in a specific format
                    const accessToken = data.access_token || data.accessToken;
                    if (accessToken) {
                      console.log(`[OAuth ${serverName}] Found token in ${filepath}`);
                      return {
                        success: true,
                        token: accessToken,
                        tokenType: 'bearer',
                        metadata: {
                          refreshToken: data.refresh_token,
                          expiresAt: data.expires_at,
                          scope: data.scope,
                          provider: serverName
                        }
                      };
                    }
                  } catch (e) {
                    console.error(`[OAuth ${serverName}] Error reading token file ${filepath}:`, e);
                  }
                }
              }
            }
          }
        }
      } catch (_e) {
        // Directory might not exist yet
      }
      
      // Fallback to checking common token file patterns
      const possibleFiles = [
        `${serverName}.json`,
        `${serverName}-token.json`,
        'tokens.json',
        'auth.json',
        // mcp-remote specific patterns
        'mcp-remote-auth.json',
        '.mcp-remote-auth.json',
        // Linear specific patterns
        'linear-auth.json',
        '.linear-auth.json'
      ];
      
      for (const filename of possibleFiles) {
        const filepath = path.join(mcpAuthDir, filename);
        
        try {
          const content = await fs.readFile(filepath, 'utf-8');
          const data = JSON.parse(content);
          
          // Extract token from various possible formats
          const token = data.access_token || 
                       data.accessToken || 
                       data.token ||
                       data.oauth?.access_token ||
                       data.oauth?.accessToken;
          
          if (token) {
            return {
              success: true,
              token,
              tokenType: 'bearer',
              metadata: {
                refreshToken: data.refresh_token || data.refreshToken,
                expiresAt: data.expires_at || data.expiresAt,
                scope: data.scope
              }
            };
          }
        } catch (_e) {
          // File doesn't exist or isn't valid JSON, continue
          continue;
        }
      }
      
      // Also check for server-specific subdirectories
      try {
        const serverDir = path.join(mcpAuthDir, serverName);
        const stats = await fs.stat(serverDir);
        
        if (stats.isDirectory()) {
          const files = await fs.readdir(serverDir);
          for (const file of files) {
            if (file.endsWith('.json')) {
              const filepath = path.join(serverDir, file);
              const content = await fs.readFile(filepath, 'utf-8');
              const data = JSON.parse(content);
              
              const token = data.access_token || data.accessToken || data.token;
              if (token) {
                return {
                  success: true,
                  token,
                  tokenType: 'bearer',
                  metadata: {
                    refreshToken: data.refresh_token || data.refreshToken,
                    expiresAt: data.expires_at || data.expiresAt,
                    scope: data.scope
                  }
                };
              }
            }
          }
        }
      } catch (_e) {
        // Directory doesn't exist, that's ok
      }
      
      // Check for mcp-remote server-specific patterns
      // mcp-remote might store tokens with a hash of the server URL
      try {
        const crypto = await import('crypto');
        const serverUrlHash = crypto.createHash('md5').update(serverName).digest('hex');
        const hashFiles = [
          `${serverUrlHash}.json`,
          `.mcp-remote-${serverUrlHash}.json`
        ];
        
        for (const filename of hashFiles) {
          const filepath = path.join(mcpAuthDir, filename);
          try {
            const content = await fs.readFile(filepath, 'utf-8');
            const data = JSON.parse(content);
            
            if (data.access_token || data.accessToken || data.token) {
              return {
                success: true,
                token: data.access_token || data.accessToken || data.token,
                tokenType: 'bearer',
                metadata: {
                  refreshToken: data.refresh_token || data.refreshToken,
                  expiresAt: data.expires_at || data.expiresAt,
                  scope: data.scope
                }
              };
            }
          } catch (_e) {
            // File doesn't exist, continue
          }
        }
      } catch (_e) {
        // crypto import failed or other error
      }
      
      return null;
    } catch (error) {
      console.error('Error checking MCP auth tokens:', error);
      return null;
    }
  }


  /**
   * Kill a process if it exists
   */
  private async killProcess(serverName: string): Promise<void> {
    const process = this.processes.get(serverName);
    if (process && !process.killed) {
      process.kill();
      this.processes.delete(serverName);
      
      // Give it a moment to clean up
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Clear existing OAuth tokens for a server
   */
  private async clearExistingTokens(serverName: string, mcpAuthDir: string = this.MCP_AUTH_DIR): Promise<void> {
    try {
      // Clear tokens from common locations
      const possibleFiles = [
        `${serverName}.json`,
        `${serverName}-token.json`,
        'tokens.json',
        'auth.json'
      ];
      
      for (const filename of possibleFiles) {
        const filepath = path.join(mcpAuthDir, filename);
        try {
          await fs.unlink(filepath);
          console.log(`[OAuth ${serverName}] Cleared existing token file: ${filename}`);
        } catch (_e) {
          // File doesn't exist, that's ok
        }
      }
      
      // Also clear server-specific subdirectories
      try {
        const serverDir = path.join(mcpAuthDir, serverName);
        await fs.rm(serverDir, { recursive: true, force: true });
        console.log(`[OAuth ${serverName}] Cleared server-specific directory`);
      } catch (_e) {
        // Directory doesn't exist, that's ok
      }
    } catch (error) {
      console.error(`[OAuth ${serverName}] Error clearing existing tokens:`, error);
    }
  }

  /**
   * Clean up all processes
   */
  async cleanup(): Promise<void> {
    for (const [_name, process] of this.processes) {
      if (!process.killed) {
        process.kill();
      }
    }
    this.processes.clear();
  }
}

// Export singleton instance
export const oauthProcessManager = new OAuthProcessManager();