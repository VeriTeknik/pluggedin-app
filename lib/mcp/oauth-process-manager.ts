import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';

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
    const { serverName, command, args, env, timeout = 300000 } = options; // 5 min timeout
    
    try {
      // Ensure .mcp-auth directory exists
      await this.ensureMcpAuthDir();
      
      // Kill any existing process for this server
      await this.killProcess(serverName);
      
      // Spawn the OAuth process
      const childProcess = spawn(command, args, {
        env: {
          ...process.env,
          ...env,
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
        
        // Check if an OAuth URL was already output
        // If not, we might need to make a request to trigger OAuth
        console.log(`[OAuth ${serverName}] mcp-remote proxy established, monitoring for OAuth flow...`);
      }
      
      // Set up monitoring
      const result = await this.monitorOAuthProcess(serverName, childProcess, timeout);
      
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
    timeout: number
  ): Promise<OAuthProcessResult> {
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      let tokenFound = false;
      let oauthUrl: string | undefined;
      
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
        output += chunk;
        console.log(`[OAuth ${serverName}] stdout:`, chunk);
        
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
        
        // Check for OAuth URL in stderr (common for mcp-remote)
        const oauthUrlMatch = chunk.match(/https:\/\/[^\s]+\/oauth[^\s]*/i) || 
                              chunk.match(/https:\/\/linear\.app\/[^\s]+/i);
        if (oauthUrlMatch && !oauthUrl) {
          oauthUrl = oauthUrlMatch[0];
          console.log(`[OAuth ${serverName}] Found OAuth URL:`, oauthUrl);
          
          // Return immediately with the OAuth URL for the client to handle
          clearTimeout(timeoutId);
          resolve({
            success: false, // Not successful yet, user needs to authenticate
            oauthUrl,
            error: 'User authentication required'
          });
          
          // Keep the process running for token capture
          // Don't return here, let the process continue
        }
        
        // Also check for Linear-specific OAuth patterns in stderr
        if (chunk.includes('Linear API key saved') || chunk.includes('Authentication successful')) {
          tokenFound = true;
          // Give it a moment to save the token
          setTimeout(async () => {
            const token = await this.checkMcpAuthToken(serverName);
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
          const token = await this.checkMcpAuthToken(serverName);
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
  private async checkMcpAuthToken(serverName: string): Promise<OAuthProcessResult | null> {
    try {
      // Common token file patterns
      const possibleFiles = [
        `${serverName}.json`,
        `${serverName}-token.json`,
        'tokens.json',
        'auth.json'
      ];
      
      for (const filename of possibleFiles) {
        const filepath = path.join(this.MCP_AUTH_DIR, filename);
        
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
        } catch (e) {
          // File doesn't exist or isn't valid JSON, continue
          continue;
        }
      }
      
      // Also check for server-specific subdirectories
      try {
        const serverDir = path.join(this.MCP_AUTH_DIR, serverName);
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
      } catch (e) {
        // Directory doesn't exist, that's ok
      }
      
      return null;
    } catch (error) {
      console.error('Error checking MCP auth tokens:', error);
      return null;
    }
  }

  /**
   * Ensure .mcp-auth directory exists
   */
  private async ensureMcpAuthDir(): Promise<void> {
    try {
      await fs.mkdir(this.MCP_AUTH_DIR, { recursive: true });
    } catch (error) {
      console.error('Failed to create .mcp-auth directory:', error);
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
   * Clean up all processes
   */
  async cleanup(): Promise<void> {
    for (const [name, process] of this.processes) {
      if (!process.killed) {
        process.kill();
      }
    }
    this.processes.clear();
  }
}

// Export singleton instance
export const oauthProcessManager = new OAuthProcessManager();