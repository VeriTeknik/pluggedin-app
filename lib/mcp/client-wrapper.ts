// Standard library imports
// Third-party library imports
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport, StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  ListPromptsResultSchema, // Added
  ListResourcesResultSchema,
  ListResourceTemplatesResultSchema,
  ListToolsResultSchema,
  Prompt, // Added
  Resource,
  ResourceTemplate,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { execSync } from 'child_process';
import os from 'os';
import path from 'path';

// Internal application imports
import { McpServerType } from '@/db/schema'; // Assuming McpServerType enum is here
import { packageManager } from '@/lib/mcp/package-manager';
import { PackageManagerConfig } from '@/lib/mcp/package-manager/config';
import { validateCommand, validateCommandArgs, validateHeaders, validateMcpUrl } from '@/lib/security/validators';
import type { McpServer } from '@/types/mcp-server'; // Assuming McpServer type is defined here

// --- Configuration & Types ---

// Add these types/interfaces at the top
interface FirejailConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

interface PathConfig {
  userHome: string;
  localBin: string;
  appPath: string;
  mcpWorkspace: string;
}

// Interface for the connected client and its cleanup function
interface ConnectedMcpClient {
  client: Client;
  cleanup: () => Promise<void>;
}

// --- Helper Functions ---

/**
 * Safely cleanup a connected MCP client, handling expected abort errors for Streamable HTTP
 */
async function safeCleanup(connectedClient: ConnectedMcpClient | undefined, serverConfig: McpServer) {
  if (!connectedClient) return;
  
  try {
    await connectedClient.cleanup();
  } catch (cleanupError: any) {
    // For Streamable HTTP, completely suppress abort errors
    if (serverConfig.type === McpServerType.STREAMABLE_HTTP) {
      // Only log non-abort errors at debug level
      if (cleanupError?.code !== 20 && cleanupError?.name !== 'AbortError' && !cleanupError?.message?.includes('abort')) {
        console.debug(`[MCP Wrapper] Cleanup warning for ${serverConfig.name}:`, cleanupError.message);
      }
      // Don't re-throw or log abort errors at all
      return;
    }
    // For other transport types, log the error
    console.error(`[MCP Wrapper] Cleanup error for ${serverConfig.name}:`, cleanupError);
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Check if a command is available on the system
async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    // Try using 'command -v' which is more portable than 'which'
    execSync(`command -v ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    // Fallback: check common binary locations
    const fs = await import('fs');
    const commonPaths = [
      `/usr/local/bin/${command}`,
      `/usr/bin/${command}`,
      `/bin/${command}`,
      `/usr/sbin/${command}`,
      `/sbin/${command}`,
      `${process.env.HOME || os.homedir()}/.local/bin/${command}`,
      `${process.env.HOME}/.local/bin/${command}`,
    ];
    
    for (const path of commonPaths) {
      try {
        await fs.promises.access(path, fs.constants.X_OK);
        return true;
      } catch {
        // Continue checking other paths
      }
    }
    
    return false;
  }
}

// Add this function to handle bubblewrap configuration
export function createBubblewrapConfig(
  serverConfig: McpServer
): FirejailConfig | null {
  // Only apply bubblewrap on Linux
  if (process.platform !== 'linux') return null;
  // Only apply bubblewrap to STDIO servers with a command
  if (serverConfig.type !== McpServerType.STDIO || !serverConfig.command) return null;

  // Read paths from environment variables with fallbacks
  // Use actual home directory as fallback instead of hardcoded /home/pluggedin
  const actualHome = process.env.HOME || os.homedir() || '/app';
  const paths: PathConfig = {
    userHome: process.env.FIREJAIL_USER_HOME ?? actualHome,
    localBin: process.env.FIREJAIL_LOCAL_BIN ?? path.join(actualHome, '.local', 'bin'),
    appPath: process.env.FIREJAIL_APP_PATH ?? process.cwd(),
    mcpWorkspace: process.env.FIREJAIL_MCP_WORKSPACE ?? path.join(actualHome, 'mcp-workspace')
  };

  // Resource limits are imported at the top

  // Base bubblewrap arguments for security and isolation
  const baseBubblewrapArgs = [
    // Process isolation
    '--unshare-all',
    // Conditionally share network based on configuration
    ...(PackageManagerConfig.ENABLE_NETWORK_ISOLATION ? [] : ['--share-net']),
    '--die-with-parent',
    '--new-session',
    
    // Filesystem setup
    '--proc', '/proc',
    '--dev', '/dev',
    '--tmpfs', '/tmp',
    
    // Bind mount workspace as home
    '--bind', paths.mcpWorkspace, paths.userHome,
    
    // Read-only system directories
    '--ro-bind', '/usr', '/usr',
    '--ro-bind', '/lib', '/lib',
    '--ro-bind', '/lib64', '/lib64',
    '--ro-bind', '/bin', '/bin',
    '--ro-bind', '/sbin', '/sbin',
    
    // Essential config files
    '--ro-bind', '/etc/resolv.conf', '/etc/resolv.conf',
    '--ro-bind', '/etc/ssl', '/etc/ssl',
    '--ro-bind', '/etc/ca-certificates', '/etc/ca-certificates',
    
    // Python-specific bindings
    '--ro-bind', '/usr/lib/python3', '/usr/lib/python3',
    '--ro-bind', '/usr/local/lib/python3', '/usr/local/lib/python3',
    
    // User's local bin directory
    '--ro-bind', paths.localBin, paths.localBin,
    
    // UV cache directory
    '--bind', `${paths.userHome}/.cache/uv`, `${paths.userHome}/.cache/uv`,
    
    // Set user and group
    '--uid', '1000',
    '--gid', '1000',
    
    // Resource limits (bubblewrap uses different syntax: --rlimit RESOURCE soft hard)
    // CPU time limit (in seconds) - using a high value since we control via cgroups
    '--rlimit', 'cpu', '3600', '3600',
    // Virtual memory limit (address space)
    '--rlimit', 'as', `${PackageManagerConfig.MEMORY_MAX_MB * 1024 * 1024}`, `${PackageManagerConfig.MEMORY_MAX_MB * 1024 * 1024}`,
    
    // Security capabilities
    '--cap-drop', 'ALL',
    
    // Set hostname
    '--hostname', 'mcp-sandbox',
  ];

  // Use the original command name
  const commandToExecute = serverConfig.command;

  // Construct the final environment
  const finalEnv = {
    // Sensible defaults
    PATH: `${paths.localBin}:/usr/local/bin:/usr/bin:/bin`,
    HOME: paths.userHome,
    USER: process.env.FIREJAIL_USER ?? 'pluggedin',
    USERNAME: process.env.FIREJAIL_USERNAME ?? 'pluggedin',
    LOGNAME: process.env.FIREJAIL_LOGNAME ?? 'pluggedin',
    // Python specific
    PYTHONPATH: `${paths.mcpWorkspace}/lib/python`,
    PYTHONUSERBASE: paths.mcpWorkspace,
    // UV specific
    UV_ROOT: `${paths.userHome}/.local/uv`,
    UV_SYSTEM_PYTHON: 'true',
    // Inherit parent process env
    ...(process.env as Record<string, string>),
    // Apply server-specific env vars
    ...(serverConfig.env || {}),
  };

  return {
    command: 'bwrap', // The bubblewrap command
    args: [
      ...baseBubblewrapArgs,
      '--',
      commandToExecute,
      ...(serverConfig.args || [])
    ],
    env: finalEnv
  };
}

// Add this function to handle firejail configuration
export function createFirejailConfig(
  serverConfig: McpServer
): FirejailConfig | null {
  // Only apply firejail on Linux
  if (process.platform !== 'linux') return null;
  // Only apply firejail to STDIO servers with a command
  if (serverConfig.type !== McpServerType.STDIO || !serverConfig.command) return null;

  // Read paths from environment variables with fallbacks
  // Use actual home directory as fallback instead of hardcoded /home/pluggedin
  const actualHome = process.env.HOME || os.homedir() || '/app';
  const paths: PathConfig = {
    userHome: process.env.FIREJAIL_USER_HOME ?? actualHome,
    localBin: process.env.FIREJAIL_LOCAL_BIN ?? path.join(actualHome, '.local', 'bin'),
    appPath: process.env.FIREJAIL_APP_PATH ?? process.cwd(),
    mcpWorkspace: process.env.FIREJAIL_MCP_WORKSPACE ?? path.join(actualHome, 'mcp-workspace')
  };
  // Only apply firejail to STDIO servers with a command
  if (serverConfig.type !== McpServerType.STDIO || !serverConfig.command) return null;


  // Restore stricter firejail config
  const baseFirejailArgs = [
      '--quiet',
      `--private=${paths.mcpWorkspace}`, // Cage to workspace
      '--noroot',

      // Network config (ignore global, use none + filter)
      '--ignore=net',
      '--net=none',
      '--netfilter',
      '--protocol=unix,inet,inet6',
      '--dns=1.1.1.1',

      // Security
      '--seccomp',
      '--memory-deny-write-execute',
      '--restrict-namespaces',

      // Whitelists
      `--whitelist=${paths.localBin}`, // Allow access to bin dir
      `--whitelist=${paths.localBin}/uv`, // Explicitly allow uv
      `--whitelist=${paths.localBin}/uvx`, // Explicitly allow uvx
      `--whitelist=${paths.mcpWorkspace}`, // Allow workspace access
      '--whitelist=/usr/lib/python*', // Python libs
      '--whitelist=/usr/local/lib/python*',
      `--whitelist=${paths.userHome}/.cache/uv`, // UV cache
      `--whitelist=${paths.userHome}/.venv`, // Virtual envs

      // Read-only system dirs
      '--read-only=/usr/bin',
      '--read-only=/usr/lib',
      '--read-only=/usr/local/bin',
      '--read-only=/usr/local/lib',

      // Private /etc
      '--private-etc=passwd,group,resolv.conf,ssl,ca-certificates,python*',

      // Temp/Dev
      '--private-tmp',
      '--private-dev',

      // Other security
      '--caps.drop=all',
      '--disable-mnt',
      '--shell=none',
  ];

  // Use the original command name; rely on PATH set within the sandbox env
  const commandToExecute = serverConfig.command;

  // Construct the final environment, prioritizing serverConfig.env
  const finalEnv = {
    // Sensible defaults, adjust user/home if needed
    PATH: `${paths.localBin}:/usr/local/bin:/usr/bin:/bin`,
    HOME: paths.userHome,
    USER: process.env.FIREJAIL_USER ?? 'pluggedin',
    USERNAME: process.env.FIREJAIL_USERNAME ?? 'pluggedin',
    LOGNAME: process.env.FIREJAIL_LOGNAME ?? 'pluggedin',
    // Python specific
    PYTHONPATH: `${paths.mcpWorkspace}/lib/python`, // Adjust if needed
    PYTHONUSERBASE: paths.mcpWorkspace, // Adjust if needed
    // UV specific
    UV_ROOT: `${paths.userHome}/.local/uv`, // Adjust if needed
    UV_SYSTEM_PYTHON: 'true',
    // Inherit parent process env (like PATH, etc.)
    ...(process.env as Record<string, string>),
    // Apply server-specific env vars, overriding inherited ones
    ...(serverConfig.env || {}),
  };


  return {
    command: 'firejail', // The actual command to run is firejail
    args: [
      ...baseFirejailArgs, // Firejail's own arguments first
      commandToExecute,   // Then the command firejail should execute
      ...(serverConfig.args || []) // Finally, the arguments for the original command
    ],
    env: finalEnv
  };
}


// --- Core Client Logic ---

/**
 * Creates an MCP Client instance and its corresponding transport based on server config.
 * Does not establish the connection yet.
 * @param skipCommandTransformation - Skip package manager command transformation (useful for discovery)
 */
async function createMcpClientAndTransport(serverConfig: McpServer, skipCommandTransformation = false): Promise<{ client: Client; transport: Transport } | null> {
  let transport: Transport | undefined;
  const clientName = 'PluggedinAppClient'; // Or get from config/package.json
  const clientVersion = '0.1.0'; // Or get from config/package.json

  try {
    if (serverConfig.type === McpServerType.STDIO) {
      if (!serverConfig.command) {
        console.error(`[MCP Wrapper] STDIO server ${serverConfig.name} is missing command.`);
        return null;
      }
      
      // Log the command we're about to run for debugging
      console.log(`[MCP Wrapper] Preparing STDIO transport for ${serverConfig.name}:`, {
        command: serverConfig.command,
        args: serverConfig.args,
        skipTransformation: skipCommandTransformation
      });

      // Validate command for security
      const commandValidation = validateCommand(serverConfig.command);
      if (!commandValidation.valid) {
        console.error(`[MCP Wrapper] Invalid command for ${serverConfig.name}: ${commandValidation.error}`);
        throw new Error(`Invalid command: ${commandValidation.error}`);
      }

      // Validate command arguments
      if (serverConfig.args) {
        const argsValidation = validateCommandArgs(serverConfig.args);
        if (!argsValidation.valid) {
          console.error(`[MCP Wrapper] Invalid arguments for ${serverConfig.name}: ${argsValidation.error}`);
          throw new Error(`Invalid arguments: ${argsValidation.error}`);
        }
      }

      // Transform command for package managers (npx, uvx, etc.)
      let transformedCommand = serverConfig.command;
      let transformedArgs = serverConfig.args || [];
      let packageManagerEnv: Record<string, string> = {};
      
      // Skip transformation if requested (e.g., during discovery)
      if (!skipCommandTransformation) {
        // Log environment info for debugging
        console.log(`[MCP Wrapper] Environment info for ${serverConfig.name}:`, {
          platform: process.platform,
          home: process.env.HOME,
          path: process.env.PATH,
          cwd: process.cwd(),
          user: process.env.USER || 'unknown'
        });
        
        try {
          const transformation = await packageManager.transformCommand(
            serverConfig.command,
            serverConfig.args || [],
            serverConfig.uuid || serverConfig.name // Use UUID if available, fallback to name
          );
          
          transformedCommand = transformation.command;
          transformedArgs = transformation.args;
          packageManagerEnv = transformation.env || {};
          
          console.log(`[MCP Wrapper] Transformed command for ${serverConfig.name}:`, {
            original: `${serverConfig.command} ${(serverConfig.args || []).join(' ')}`,
            transformed: `${transformedCommand} ${transformedArgs.join(' ')}`
          });
        } catch (error) {
          console.error(`[MCP Wrapper] Failed to transform command for ${serverConfig.name}:`, error);
          // Log more details about the failure
          console.error(`[MCP Wrapper] Command transformation details:`, {
            command: serverConfig.command,
            args: serverConfig.args,
            error: error instanceof Error ? error.message : String(error)
          });
          // Continue with original command if transformation fails
        }
      } else {
        console.log(`[MCP Wrapper] Skipping command transformation for ${serverConfig.name} (discovery mode)`);
      }

      // Apply sandboxing only if explicitly requested and applicable
      let sandboxConfig: FirejailConfig | null = null;
      if (serverConfig.applySandboxing === true) { // Check for the flag
        // Package manager config is imported at the top
        
        // Check availability of isolation tools
        const [bwrapAvailable, firejailAvailable] = await Promise.all([
          isCommandAvailable('bwrap'),
          isCommandAvailable('firejail')
        ]);
        
        // Log availability for debugging
        console.log(`[MCP Wrapper] Isolation tools availability:`, {
          bwrap: bwrapAvailable,
          firejail: firejailAvailable,
          platform: process.platform,
          configuredType: PackageManagerConfig.ISOLATION_TYPE,
          fallback: PackageManagerConfig.ISOLATION_FALLBACK
        });
        
        // Try to use the configured isolation type
        if (PackageManagerConfig.ISOLATION_TYPE === 'bubblewrap' && bwrapAvailable) {
          const bubblewrapConfig = createBubblewrapConfig(serverConfig);
          if (bubblewrapConfig) {
            // Update bubblewrap args with transformed command
            const bwrapArgs = [...bubblewrapConfig.args];
            // Find the index of '--' separator
            const separatorIndex = bwrapArgs.indexOf('--');
            if (separatorIndex >= 0) {
              // Replace command and args after '--'
              bwrapArgs.splice(separatorIndex + 1, bwrapArgs.length - separatorIndex - 1, transformedCommand, ...transformedArgs);
            }
            sandboxConfig = {
              command: bubblewrapConfig.command,
              args: bwrapArgs,
              env: {
                ...bubblewrapConfig.env,
                ...packageManagerEnv
              }
            };
            console.log(`[MCP Wrapper] Using Bubblewrap isolation for ${serverConfig.name}`);
          } else if (PackageManagerConfig.ISOLATION_FALLBACK === 'firejail' && firejailAvailable) {
            // Fall back to firejail if bubblewrap config failed
            const firejailConfig = createFirejailConfig(serverConfig);
            if (firejailConfig) {
              // Update firejail args with transformed command
              const fjArgs = [...firejailConfig.args];
              // Find where the command starts (after all firejail flags)
              const commandIndex = fjArgs.findIndex(arg => arg === serverConfig.command);
              if (commandIndex >= 0) {
                // Replace command and args
                fjArgs.splice(commandIndex, fjArgs.length - commandIndex, transformedCommand, ...transformedArgs);
              }
              sandboxConfig = {
                command: firejailConfig.command,
                args: fjArgs,
                env: {
                  ...firejailConfig.env,
                  ...packageManagerEnv
                }
              };
              console.log(`[MCP Wrapper] Falling back to Firejail isolation for ${serverConfig.name}`);
            }
          }
        } else if (PackageManagerConfig.ISOLATION_TYPE === 'firejail' && firejailAvailable) {
          // Use firejail as primary isolation
          const firejailConfig = createFirejailConfig(serverConfig);
          if (firejailConfig) {
            // Update firejail args with transformed command
            const fjArgs = [...firejailConfig.args];
            // Find where the command starts (after all firejail flags)
            const commandIndex = fjArgs.findIndex(arg => arg === serverConfig.command);
            if (commandIndex >= 0) {
              // Replace command and args
              fjArgs.splice(commandIndex, fjArgs.length - commandIndex, transformedCommand, ...transformedArgs);
            }
            sandboxConfig = {
              command: firejailConfig.command,
              args: fjArgs,
              env: {
                ...firejailConfig.env,
                ...packageManagerEnv
              }
            };
            console.log(`[MCP Wrapper] Using Firejail isolation for ${serverConfig.name}`);
          }
        } else if (PackageManagerConfig.ISOLATION_TYPE === 'bubblewrap' && !bwrapAvailable && firejailAvailable) {
          // Bubblewrap was requested but not available, try fallback
          console.warn(`[MCP Wrapper] Bubblewrap not available, attempting fallback to Firejail for ${serverConfig.name}`);
          const firejailConfig = createFirejailConfig(serverConfig);
          if (firejailConfig) {
            // Update firejail args with transformed command
            const fjArgs = [...firejailConfig.args];
            // Find where the command starts (after all firejail flags)
            const commandIndex = fjArgs.findIndex(arg => arg === serverConfig.command);
            if (commandIndex >= 0) {
              // Replace command and args
              fjArgs.splice(commandIndex, fjArgs.length - commandIndex, transformedCommand, ...transformedArgs);
            }
            sandboxConfig = {
              command: firejailConfig.command,
              args: fjArgs,
              env: {
                ...firejailConfig.env,
                ...packageManagerEnv
              }
            };
            console.log(`[MCP Wrapper] Using Firejail isolation (fallback) for ${serverConfig.name}`);
          }
        } else {
          // No isolation tools available
          console.warn(`[MCP Wrapper] No isolation tools available for ${serverConfig.name}. Running without sandboxing.`);
        }
      }

      const stdioParams: StdioServerParameters = sandboxConfig ? {
        // Use sandbox configuration because applySandboxing was true
        command: sandboxConfig.command,
        args: sandboxConfig.args,
        env: {
          ...sandboxConfig.env,
          ...packageManagerEnv // Merge package manager env
        }
      } : {
        // Use transformed configuration
        command: transformedCommand,
        args: transformedArgs,
        env: {
          // Start with parent process env
          ...(process.env as Record<string, string>),
          // Only add Linux-specific paths on Linux systems
          ...(process.platform === 'linux' ? {
            // Add potentially missing vars needed by uvx/python on Linux
            // Use dynamic home directory detection
            PATH: `${process.env.FIREJAIL_LOCAL_BIN ?? path.join(process.env.HOME || os.homedir() || '/app', '.local/bin')}:${process.env.PATH}`, // Prepend local bin
            HOME: process.env.FIREJAIL_USER_HOME ?? process.env.HOME ?? os.homedir() ?? '/app',
            UV_ROOT: `${process.env.FIREJAIL_USER_HOME ?? process.env.HOME ?? os.homedir() ?? '/app'}/.local/uv`,
            PYTHONPATH: `${process.env.FIREJAIL_MCP_WORKSPACE ?? path.join(process.env.HOME || os.homedir() || '/app', 'mcp-workspace')}/lib/python`,
            PYTHONUSERBASE: process.env.FIREJAIL_MCP_WORKSPACE ?? path.join(process.env.HOME || os.homedir() || '/app', 'mcp-workspace'),
            UV_SYSTEM_PYTHON: 'true',
          } : {}),
          // Apply package manager env
          ...packageManagerEnv,
          // Apply server-specific env vars, overriding anything above
          ...(serverConfig.env || {})
        }
      };

      console.log(`[MCP Wrapper] Creating STDIO transport with params:`, {
        command: stdioParams.command,
        args: stdioParams.args?.slice(0, 5), // Log first 5 args only
        hasEnv: !!stdioParams.env,
        envKeys: Object.keys(stdioParams.env || {})
      });
      
      try {
        transport = new StdioClientTransport(stdioParams);
      } catch (error) {
        console.error(`[MCP Wrapper] Failed to create STDIO transport:`, error);
        
        // Check if the command exists
        const commandExists = await isCommandAvailable(stdioParams.command);
        if (!commandExists) {
          console.error(`[MCP Wrapper] Command '${stdioParams.command}' not found in PATH or common locations`);
          console.error(`[MCP Wrapper] Current PATH: ${process.env.PATH}`);
          
          // Provide helpful suggestions
          if (stdioParams.command === 'npx') {
            console.error(`[MCP Wrapper] Suggestion: Install npm/npx with 'apt-get install npm' or ensure Node.js installation includes npm`);
          } else if (stdioParams.command === 'uvx' || stdioParams.command === 'uv') {
            console.error(`[MCP Wrapper] Suggestion: Install uv with 'curl -LsSf https://astral.sh/uv/install.sh | sh'`);
          }
        }
        
        throw error;
      }
    } else if (serverConfig.type === McpServerType.SSE) {
      // Log deprecation warning
      console.warn(`[MCP Wrapper] ⚠️ SSE transport is deprecated. Server "${serverConfig.name}" should be migrated to Streamable HTTP.`);
      
      if (!serverConfig.url) {
        console.error(`[MCP Wrapper] SSE server ${serverConfig.name} is missing URL.`);
        return null;
      }
      
      // Validate URL for security
      const urlValidation = validateMcpUrl(serverConfig.url);
      if (!urlValidation.valid) {
        console.error(`[MCP Wrapper] Invalid URL for ${serverConfig.name}: ${urlValidation.error}`);
        throw new Error(`Invalid URL: ${urlValidation.error}`);
      }
      
      transport = new SSEClientTransport(urlValidation.parsedUrl!);
    } else if (serverConfig.type === McpServerType.STREAMABLE_HTTP) {
      if (!serverConfig.url) {
        console.error(`[MCP Wrapper] Streamable HTTP server ${serverConfig.name} is missing URL.`);
        return null;
      }
      
      // Validate URL for security
      const urlValidation = validateMcpUrl(serverConfig.url);
      if (!urlValidation.valid) {
        console.error(`[MCP Wrapper] Invalid URL for ${serverConfig.name}: ${urlValidation.error}`);
        throw new Error(`Invalid URL: ${urlValidation.error}`);
      }
      
      const url = urlValidation.parsedUrl!;
      
      try {
        // Extract streamable HTTP options from env or directly from serverConfig
        let streamableOptions: any = {};
        
        // Check if options are in env (from database storage)
        if (serverConfig.env?.__streamableHTTPOptions) {
          try {
            const parsed = JSON.parse(serverConfig.env.__streamableHTTPOptions);
            // Validate the parsed options have expected structure
            if (parsed && typeof parsed === 'object') {
              streamableOptions = parsed;
            } else {
              console.warn(`[MCP Wrapper] Invalid streamableHTTPOptions format for ${serverConfig.name}, using defaults`);
              streamableOptions = {};
            }
          } catch (e) {
            console.error(`[MCP Wrapper] Failed to parse streamableHTTPOptions from env for ${serverConfig.name}:`, e);
            // Provide explicit fallback instead of silent failure
            console.warn(`[MCP Wrapper] Using default streamableHTTPOptions for ${serverConfig.name}`);
            streamableOptions = {};
          }
        }
        
        // Or use directly from serverConfig (from playground/runtime)
        if (serverConfig.streamableHTTPOptions) {
          streamableOptions = serverConfig.streamableHTTPOptions;
        }
        
        // Create StreamableHTTPClientTransport with options
        const transportOptions: any = {};
        
        // Set default headers for Streamable HTTP
        const defaultHeaders: Record<string, string> = {
          'Accept': 'application/json, text/event-stream',
          'User-Agent': 'Plugged.in MCP Client'
        };
        
        // Add custom headers if provided with validation
        if (streamableOptions?.headers && typeof streamableOptions.headers === 'object') {
          const headerValidation = validateHeaders(streamableOptions.headers);
          if (!headerValidation.valid) {
            console.error(`[MCP Wrapper] Invalid headers for ${serverConfig.name}: ${headerValidation.error}`);
            throw new Error(`Invalid headers: ${headerValidation.error}`);
          }
          
          transportOptions.requestInit = {
            headers: {
              ...defaultHeaders,
              ...headerValidation.sanitizedHeaders
            }
          };
        } else {
          transportOptions.requestInit = {
            headers: defaultHeaders
          };
        }
        
        
        // Add session ID if provided
        if (streamableOptions?.sessionId && typeof streamableOptions.sessionId === 'string') {
          transportOptions.sessionId = streamableOptions.sessionId;
        }
        
        // Add a reasonable default timeout for all Streamable HTTP connections
        // This helps prevent indefinite hanging on slow servers
        if (streamableOptions?.timeout && typeof streamableOptions.timeout === 'number') {
          transportOptions.timeout = streamableOptions.timeout;
        } else {
          transportOptions.timeout = 30000; // 30 seconds default
        }
        
        console.log(`[MCP Wrapper] Creating Streamable HTTP transport for server ${serverConfig.name} with ${transportOptions.timeout}ms timeout`);
        transport = new StreamableHTTPClientTransport(url, transportOptions);
      } catch (error) {
        console.error(`[MCP Wrapper] Failed to create Streamable HTTP transport:`, error);
        throw error; // Propagate the error instead of falling back
      }
    } else {
      console.error(`[MCP Wrapper] Unsupported server type: ${serverConfig.type} for server ${serverConfig.name}`);
      return null;
    }

    if (!transport) {
      console.error(`[MCP Wrapper] Failed to create transport for ${serverConfig.name}`);
      return null;
    }

    const client = new Client(
      { name: clientName, version: clientVersion },
      { capabilities: { tools: {}, resources: {}, prompts: {} } } // Assume all capabilities initially
    );

    return { client, transport };

  } catch (error) {
    console.error(`[MCP Wrapper] Error creating client/transport for ${serverConfig.name}:`, error);
    return null;
  }
}

/**
 * Connects an MCP Client to its transport with retry logic.
 */
async function connectMcpClient(
  initialClient: Client,
  initialTransport: Transport,
  serverName: string,
  serverConfig: McpServer,
  retries = 2,
  delay = 1000,
  skipCommandTransformation = false
): Promise<ConnectedMcpClient> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    let client = initialClient;
    let transport = initialTransport;
    
    try {
      if (attempt > 0) {
        console.log(`[MCP Wrapper] Retrying connection to ${serverName} (Attempt ${attempt})...`);
        await sleep(delay);
        
        // For retries, always create fresh client and transport to avoid state issues
        const newClientData = await createMcpClientAndTransport(serverConfig, skipCommandTransformation);
        if (!newClientData) {
          throw new Error(`Failed to create new client/transport for retry attempt ${attempt}`);
        }
        client = newClientData.client;
        transport = newClientData.transport;
      }
      
      await client.connect(transport);
      console.log(`[MCP Wrapper] Connected to ${serverName}.`);
      return {
        client,
        cleanup: async () => {
          try {
            // For StreamableHTTPClientTransport, we need to be very careful about cleanup
            // as it may throw abort errors when the underlying fetch is cancelled
            if (serverConfig.type === McpServerType.STREAMABLE_HTTP) {
              // Wrap each close in a separate try-catch and continue regardless
              const closeTransport = async () => {
                try {
                  await transport.close();
                } catch (e: any) {
                  // Silently ignore all errors for Streamable HTTP transport
                  // as abort errors are expected when fetch is cancelled
                  if (e?.code !== 20 && e?.name !== 'AbortError') {
                    console.debug(`[MCP Wrapper] Transport cleanup warning for ${serverName}:`, e.message);
                  }
                }
              };
              
              const closeClient = async () => {
                try {
                  await client.close();
                } catch (e: any) {
                  // Silently ignore all errors for Streamable HTTP client
                  if (e?.code !== 20 && e?.name !== 'AbortError') {
                    console.debug(`[MCP Wrapper] Client cleanup warning for ${serverName}:`, e.message);
                  }
                }
              };
              
              // Run both closes in parallel to minimize wait time
              await Promise.all([closeTransport(), closeClient()]);
            } else {
              // For other transport types, use normal cleanup
              await transport.close();
              await client.close();
            }
            console.log(`[MCP Wrapper] Cleaned up connection for ${serverName}.`);
          } catch (cleanupError) {
            console.error(`[MCP Wrapper] Error during cleanup for ${serverName}:`, cleanupError);
          }
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      console.warn(`[MCP Wrapper] Connection attempt ${attempt + 1} failed for ${serverName}: ${lastError.message}`);
      // Ensure client/transport are closed before retry
      if (attempt > 0) {
        // Only close if we're using retry-created instances
        try { 
          await transport.close(); 
        } catch (e: any) { 
          // Ignore abort errors
          if (e?.code !== 20 && e?.name !== 'AbortError') {
            console.debug(`[MCP Wrapper] Error closing transport during retry:`, e.message);
          }
        }
        try { 
          await client.close(); 
        } catch (e: any) { 
          // Ignore abort errors
          if (e?.code !== 20 && e?.name !== 'AbortError') {
            console.debug(`[MCP Wrapper] Error closing client during retry:`, e.message);
          }
        }
      }
    }
  }
  throw lastError || new Error(`Failed to connect to ${serverName} after ${retries + 1} attempts.`);
}

// --- Public API ---

/**
 * Connects to a single MCP server and lists its tools.
 * Handles connection, listing, and cleanup.
 * @param serverConfig Configuration of the MCP server.
 * @returns A promise resolving to the list of tools or throwing an error.
 */
export async function listToolsFromServer(serverConfig: McpServer): Promise<Tool[]> {
  // Validate required server config fields
  if (!serverConfig) {
    throw new Error('Server configuration is required');
  }
  
  const serverIdentifier = serverConfig.name || serverConfig.uuid || 'unknown';
  // Use discovery mode - skip command transformation since we're just listing capabilities
  const clientData = await createMcpClientAndTransport(serverConfig, true);
  if (!clientData) {
    throw new Error(`Failed to create client/transport for server ${serverIdentifier}`);
  }

  let connectedClient: ConnectedMcpClient | undefined;
  try {
    connectedClient = await connectMcpClient(clientData.client, clientData.transport, serverIdentifier, serverConfig, 2, 1000, true);

    // Check capabilities *after* connecting
    const capabilities = connectedClient.client.getServerCapabilities();
    if (!capabilities?.tools) {
        // console.log(`[MCP Wrapper] Server ${serverIdentifier} does not advertise tool support.`); // Removed console log
        return []; // Return empty list if tools are not supported
    }

    // Server claims to support tools, attempt the request
    const result = await connectedClient.client.request(
      { method: 'tools/list', params: {} },
      ListToolsResultSchema
    );
    
    // Return tools as-is without transforming names, with additional safety check
    // This ensures compatibility with clients that expect original tool names
    return Array.isArray(result?.tools) ? result.tools : [];
  } catch (error) {
    console.error(`[MCP Wrapper] Error listing tools from ${serverIdentifier}:`, error);
    throw error; // Re-throw the error to be handled by the caller
  } finally {
    await safeCleanup(connectedClient, serverConfig);
  }
}

/**
 * Connects to a single MCP server and lists its resource templates.
 * Handles connection, listing, and cleanup.
 * @param serverConfig Configuration of the MCP server.
 * @returns A promise resolving to the list of resource templates or throwing an error.
 */
export async function listResourceTemplatesFromServer(serverConfig: McpServer): Promise<ResourceTemplate[]> {
    // Validate required server config fields
    if (!serverConfig) {
        throw new Error('Server configuration is required');
    }
    
    const serverIdentifier = serverConfig.name || serverConfig.uuid || 'unknown';
    // Use discovery mode - skip command transformation since we're just listing capabilities
    const clientData = await createMcpClientAndTransport(serverConfig, true);
    if (!clientData) {
        throw new Error(`Failed to create client/transport for server ${serverIdentifier}`);
    }

    let connectedClient: ConnectedMcpClient | undefined;
    try {
    connectedClient = await connectMcpClient(clientData.client, clientData.transport, serverIdentifier, serverConfig, 2, 1000, true);

    // Check capabilities *after* connecting
    const capabilities = connectedClient.client.getServerCapabilities();
    if (!capabilities?.resources) {
        // console.log(`[MCP Wrapper] Server ${serverIdentifier} does not advertise resource support (needed for templates).`); // Removed console log
        return []; // Return empty list if resources are not supported
    }

    // Server claims to support resources, attempt the request
    const result = await connectedClient.client.request(
            { method: 'resources/templates/list', params: {} },
            ListResourceTemplatesResultSchema
        );
        return Array.isArray(result?.resourceTemplates) ? result.resourceTemplates : [];
    } catch (error: any) { // Add type to error
        // Specifically handle "Method not found" for templates list as non-critical
        if (error?.code === -32601 && error?.message?.includes('Method not found')) {
             console.warn(`[MCP Wrapper] Server ${serverIdentifier} does not implement resources/templates/list. Returning empty array.`);
             return [];
        }
        // Log and re-throw other errors
        console.error(`[MCP Wrapper] Error listing resource templates from ${serverIdentifier}:`, error);
        throw error; // Re-throw the error to be handled by the caller
    } finally {
        await safeCleanup(connectedClient, serverConfig);
    }
}

/**
 * Connects to a single MCP server and lists its static resources.
 * Handles connection, listing, and cleanup.
 * @param serverConfig Configuration of the MCP server.
 * @returns A promise resolving to the list of resources or throwing an error.
 */
export async function listResourcesFromServer(serverConfig: McpServer): Promise<Resource[]> {
    // Validate required server config fields
    if (!serverConfig) {
        throw new Error('Server configuration is required');
    }
    
    const serverIdentifier = serverConfig.name || serverConfig.uuid || 'unknown';
    const clientData = await createMcpClientAndTransport(serverConfig);
    if (!clientData) {
        throw new Error(`Failed to create client/transport for server ${serverIdentifier}`);
    }

    let connectedClient: ConnectedMcpClient | undefined;
    try {
        connectedClient = await connectMcpClient(clientData.client, clientData.transport, serverIdentifier, serverConfig, 2, 1000, true);

        // Check capabilities *after* connecting
        const capabilities = connectedClient.client.getServerCapabilities();
        if (!capabilities?.resources) {
            // console.log(`[MCP Wrapper] Server ${serverIdentifier} does not advertise resource support.`); // Removed console log
            return []; // Return empty list if resources are not supported
        }

        // Server claims to support resources, attempt the request
        const result = await connectedClient.client.request(
            { method: 'resources/list', params: {} },
            ListResourcesResultSchema // Use the correct schema
        );
        return Array.isArray(result?.resources) ? result.resources : [];
    } catch (error: any) { // Add type to error
        // Specifically handle "Method not found" for resources list as non-critical
        if (error?.code === -32601 && error?.message?.includes('Method not found')) {
             console.warn(`[MCP Wrapper] Server ${serverIdentifier} does not implement resources/list. Returning empty array.`);
             return [];
        }
        // Log and re-throw other errors
        console.error(`[MCP Wrapper] Error listing resources from ${serverIdentifier}:`, error);
        throw error; // Re-throw the error to be handled by the caller
    } finally {
        await safeCleanup(connectedClient, serverConfig);
    }
}

/**
 * Connects to a single MCP server and lists its prompts.
 * Handles connection, listing, and cleanup.
 * @param serverConfig Configuration of the MCP server.
 * @returns A promise resolving to the list of prompts or throwing an error.
 */
export async function listPromptsFromServer(serverConfig: McpServer): Promise<Prompt[]> {
    // Validate required server config fields
    if (!serverConfig) {
        throw new Error('Server configuration is required');
    }
    
    const serverIdentifier = serverConfig.name || serverConfig.uuid || 'unknown';
    const clientData = await createMcpClientAndTransport(serverConfig);
    if (!clientData) {
        throw new Error(`Failed to create client/transport for server ${serverIdentifier}`);
    }

    let connectedClient: ConnectedMcpClient | undefined;
    try {
        connectedClient = await connectMcpClient(clientData.client, clientData.transport, serverIdentifier, serverConfig, 2, 1000, true);

        // Check capabilities *after* connecting
        const capabilities = connectedClient.client.getServerCapabilities();
        if (!capabilities?.prompts) {
            // console.log(`[MCP Wrapper] Server ${serverIdentifier} does not advertise prompt support.`);
            return []; // Return empty list if prompts are not supported
        }

        // Server claims to support prompts, attempt the request
        const result = await connectedClient.client.request(
            { method: 'prompts/list', params: {} },
            ListPromptsResultSchema // Use the correct schema
        );
        return Array.isArray(result?.prompts) ? result.prompts : [];
    } catch (error: any) {
        // Specifically handle "Method not found" for prompts list as non-critical
        if (error?.code === -32601 && error?.message?.includes('Method not found')) {
             console.warn(`[MCP Wrapper] Server ${serverIdentifier} does not implement prompts/list. Returning empty array.`);
             return [];
        }
        // Log and re-throw other errors
        console.error(`[MCP Wrapper] Error listing prompts from ${serverIdentifier}:`, error);
        throw error; // Re-throw the error to be handled by the caller
    } finally {
        await safeCleanup(connectedClient, serverConfig);
    }
}


// TODO: Add functions for callTool, readResource, getPrompt etc. as needed, reusing create/connect logic.
