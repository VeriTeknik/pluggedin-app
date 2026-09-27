import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import { constants as fsConstants, promises as fs } from 'fs';
import type { FileHandle } from 'fs/promises';
import os from 'os';
import path from 'path';

import { approvedChildPath, inheritableChildEnv } from '@/lib/mcp/child-env';
import { PackageManagerConfig } from '@/lib/mcp/package-manager/config';
import { portAllocator } from '@/lib/mcp/utils/port-allocator';
import { buildSecurePath, buildServerScopedPath, validatePathComponent } from '@/lib/secure-path-builder';

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

/*
 * Token files live under `<server>/oauth/.mcp-auth`, which the server's
 * sandboxed child writes. Their paths are realpath-checked when they are built,
 * but the child can swap `.mcp-auth`, or any name in it, for a symlink (to
 * another server's tokens), a FIFO or something huge at any moment after that
 * — an OAuth flow runs for minutes. So the host never follows a name in there
 * at the time of use:
 *
 * - a read opens the last name without following a link or blocking, takes
 *   only a regular file of token size, and checks where the opened file
 *   actually is;
 * - a clear acts through the directory opened without following a link.
 */

/** A token file is a few hundred bytes of JSON; anything far larger is not one. */
const MAX_TOKEN_FILE_BYTES = 1024 * 1024;

const OPEN_DIRECTORY_NOFOLLOW = fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW;

/**
 * A path that reaches the directory `handle` has open, whatever the name it
 * was opened by points at now: Linux's /proc/self/fd/<n>. A name looked up
 * through it is looked up in that very directory, which is what openat and
 * unlinkat do in C. Without procfs — macOS, where there is no sandboxed child
 * to race — the path it was opened by.
 */
async function pinnedDirectoryPath(handle: FileHandle, openedAs: string): Promise<string> {
  const viaDescriptor = `/proc/self/fd/${handle.fd}`;
  try {
    await fs.access(viaDescriptor);
    return viaDescriptor;
  } catch {
    return openedAs;
  }
}

/**
 * Where the file `handle` has open really is. Linux reports it for the
 * descriptor itself, which no link swapped in later can change; elsewhere the
 * resolved path is the best answer there is.
 */
async function openedFileLocation(handle: FileHandle, openedAs: string): Promise<string> {
  try {
    return await fs.readlink(`/proc/self/fd/${handle.fd}`);
  } catch {
    return fs.realpath(openedAs);
  }
}

/** Reads a token file that must really be inside `root`, a directory the child cannot swap. */
async function readConfinedTokenFile(filepath: string, root: string): Promise<string> {
  const handle = await fs.open(
    filepath,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_TOKEN_FILE_BYTES) {
      throw new Error('Not a token file');
    }
    const [location, realRoot] = await Promise.all([openedFileLocation(handle, filepath), fs.realpath(root)]);
    if (!location.startsWith(realRoot + path.sep)) {
      throw new Error('Token file is outside the server\'s OAuth directory');
    }
    // No more than was there when it was checked: the child can keep writing.
    const buffer = Buffer.alloc(stat.size);
    let filled = 0;
    while (filled < buffer.length) {
      const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, filled);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    return buffer.subarray(0, filled).toString('utf-8');
  } finally {
    await handle.close();
  }
}

/**
 * Generic OAuth Process Manager for MCP servers
 * Handles spawning processes that manage their own OAuth flows
 */
export class OAuthProcessManager extends EventEmitter {
  private processes: Map<string, ChildProcess> = new Map();
  private processPorts: Map<string, number> = new Map();
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
        // Validate serverUuid to prevent path traversal
        validatePathComponent(serverUuid);
        // Use server-specific OAuth directory. The server's sandboxed child can
        // write there, so anchor at its own directory, not the shared store.
        oauthHome = buildServerScopedPath(PackageManagerConfig.PACKAGE_STORE_DIR, serverUuid, 'oauth');
        await fs.mkdir(oauthHome, { recursive: true });
        isolatedMcpAuthDir = buildSecurePath(oauthHome, '.mcp-auth');
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

      // Validate command to prevent injection attacks
      // Since spawn is used with shell: false, we only need to block shell metacharacters
      // Allow paths with spaces, colons (Windows), backslashes, etc.
      if (/[;&|`$()<>]/.test(command)) {
        throw new Error('Invalid command: contains shell metacharacters');
      }

      // Validate args array
      if (!Array.isArray(args)) {
        throw new Error('Arguments must be an array');
      }

      // Spawn the OAuth process with isolated HOME and shell: false for security
      const childProcess = spawn(command, args, {
        env: {
          // Allowlist, not the whole environment: this process holds the app's
          // secrets and the spawned mcp-remote is a user-chosen binary.
          ...inheritableChildEnv(),
          ...env,
          // PATH after the caller's env, not before: an approved executable
          // boundary that a supplied variable can replace is not a boundary.
          PATH: approvedChildPath(),
          // Use isolated HOME directory to isolate .mcp-auth
          HOME: oauthHome,
          // Ensure OAuth callback port is set if provided
          ...(options.callbackPort && { OAUTH_CALLBACK_PORT: options.callbackPort.toString() })
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false // Explicitly disable shell execution to prevent command injection
      });
      
      this.processes.set(serverName, childProcess);
      
      // Track the port if provided for cleanup
      if (options.callbackPort) {
        this.processPorts.set(serverName, options.callbackPort);
      }
      
      // For mcp-remote servers, we need to wait for it to start then trigger a request
      if (args.includes('mcp-remote')) {
        // Wait for the proxy to be established
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Trigger a request to the MCP server to initiate OAuth
        
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
              } catch (_error) {
              }
            }, 2000);
          } catch (_error) {
          }
        }, 1000);
      }
      
      // Set up monitoring with isolated directory
      const result = await this.monitorOAuthProcess(serverName, childProcess, timeout, isolatedMcpAuthDir);
      
      // Clean up
      this.processes.delete(serverName);
      this.processPorts.delete(serverName);
      
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
                          const tokenData = await this.checkMcpAuthToken(serverName, mcpAuthDir);
                          
                          if (tokenData && tokenData.token) {
                            resolve(tokenData);
                          } else if (attempts < maxAttempts) {
                            setTimeout(checkForToken, checkInterval);
                          } else {
                            // Fallback to success without token - auth is working but we couldn't extract token
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
        
        // Look for specific mcp-remote OAuth patterns
        if (chunk.includes('Please authorize this client by visiting:')) {
          // Extract the OAuth URL and validate it
          const urlMatch = chunk.match(/https:\/\/[^\s]+/);
          if (urlMatch && !oauthUrl) {
            const extractedUrl = urlMatch[0];
            
            // Validate the URL is from an expected OAuth provider
            try {
              const url = new URL(extractedUrl);
              const allowedHosts = [
                'mcp.linear.app',
                'linear.app',
                'github.com',
                'api.github.com',
                'slack.com',
                'api.slack.com'
              ];
              
              if (allowedHosts.some(host => url.hostname === host || url.hostname === `www.${host}`)) {
                oauthUrl = extractedUrl;
              } else {
                console.warn('[OAuthProcessManager] Ignoring untrusted OAuth URL:', extractedUrl);
              }
            } catch (e) {
              console.error('[OAuthProcessManager] Invalid OAuth URL found:', extractedUrl);
            }
            oauthUrlFound = true;
            
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

      // Handle child process exit
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

      // Handle child process error
      process.on('error', (error: Error) => {
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
    // Reads are confined to the directory holding .mcp-auth (the server's
    // `oauth`), not to .mcp-auth itself, which the child can swap for a link.
    const readToken = (filepath: string) => readConfinedTokenFile(filepath, path.dirname(mcpAuthDir));
    try {
      // First check for mcp-remote subdirectory structure
      try {
        const entries = await fs.readdir(mcpAuthDir);
        
        // Look for mcp-remote-* directories
        for (const entry of entries) {
          if (entry.startsWith('mcp-remote-')) {
            // Validate entry name to prevent path traversal
            validatePathComponent(entry);
            const subDir = buildSecurePath(mcpAuthDir, entry);
            const stat = await fs.stat(subDir);

            if (stat.isDirectory()) {
              const files = await fs.readdir(subDir);

              // Look for *_tokens.json files
              for (const file of files) {
                if (file.endsWith('_tokens.json')) {
                  // Validate file name to prevent path traversal
                  validatePathComponent(file);
                  const filepath = buildSecurePath(subDir, file);
                  try {
                    const content = await readToken(filepath);
                    const data = JSON.parse(content);
                    
                    // mcp-remote stores tokens in a specific format
                    const accessToken = data.access_token || data.accessToken;
                    if (accessToken) {
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
        // Validate filename to prevent path traversal
        validatePathComponent(filename);
        const filepath = buildSecurePath(mcpAuthDir, filename);

        try {
          const content = await readToken(filepath);
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
        // Validate serverName to prevent path traversal
        validatePathComponent(serverName);
        const serverDir = buildSecurePath(mcpAuthDir, serverName);
        const stats = await fs.stat(serverDir);

        if (stats.isDirectory()) {
          const files = await fs.readdir(serverDir);
          for (const file of files) {
            if (file.endsWith('.json')) {
              // Validate file name to prevent path traversal
              validatePathComponent(file);
              const filepath = buildSecurePath(serverDir, file);
              const content = await readToken(filepath);
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
          // Validate filename to prevent path traversal
          validatePathComponent(filename);
          const filepath = buildSecurePath(mcpAuthDir, filename);
          try {
            const content = await readToken(filepath);
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
    } catch (_error) {
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
      
      // Release the port if tracked
      const port = this.processPorts.get(serverName);
      if (port && !global.process.env?.OAUTH_USE_LEGACY_PORTS) {
        portAllocator.releasePort(port);
        this.processPorts.delete(serverName);
      }
      
      // Give it a moment to clean up
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Clear existing OAuth tokens for a server
   */
  private async clearExistingTokens(serverName: string, mcpAuthDir: string = this.MCP_AUTH_DIR): Promise<void> {
    // Everything goes through the directory opened here, without following a
    // link, so nothing outside it is touched whatever the path points at by
    // the time each file is removed. Missing, or a link: nothing to clear.
    let authDir: FileHandle;
    try {
      authDir = await fs.open(mcpAuthDir, OPEN_DIRECTORY_NOFOLLOW);
    } catch {
      return;
    }

    try {
      const base = await pinnedDirectoryPath(authDir, mcpAuthDir);

      // Clear tokens from common locations
      const possibleFiles = [
        `${serverName}.json`,
        `${serverName}-token.json`,
        'tokens.json',
        'auth.json'
      ];

      for (const filename of possibleFiles) {
        try {
          // unlink never follows the last name: a link is removed, not its target.
          await fs.unlink(path.join(base, validatePathComponent(filename)));
        } catch (_e) {
          // File doesn't exist, that's ok
        }
      }

      // Also clear the server-specific subdirectory. Token directories are
      // flat — the reader only looks one level down — so it is emptied one
      // level deep through its own descriptor, then removed.
      try {
        const serverDirPath = path.join(base, validatePathComponent(serverName));
        const serverDir = await fs.open(serverDirPath, OPEN_DIRECTORY_NOFOLLOW);
        try {
          const inner = await pinnedDirectoryPath(serverDir, serverDirPath);
          for (const entry of await fs.readdir(inner)) {
            await fs.unlink(path.join(inner, entry)).catch(() => {
              // A nested directory: left alone.
            });
          }
        } finally {
          await serverDir.close();
        }
        await fs.rmdir(serverDirPath);
      } catch (_e) {
        // Directory doesn't exist (or is a link, left alone), that's ok
      }
    } catch (_error) {
    } finally {
      await authDir.close();
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
      
      // Release any tracked ports
      const port = this.processPorts.get(name);
      if (port && !global.process.env?.OAUTH_USE_LEGACY_PORTS) {
        portAllocator.releasePort(port);
      }
    }
    this.processes.clear();
    this.processPorts.clear();
  }
}

// Export singleton instance
export const oauthProcessManager = new OAuthProcessManager();