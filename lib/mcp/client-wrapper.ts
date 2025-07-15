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
import * as fs from 'fs';
import os from 'os';
import path from 'path';

// Internal application imports
import { McpServerType } from '@/db/schema'; // Assuming McpServerType enum is here
import { packageManager } from '@/lib/mcp/package-manager';
import { PackageManagerConfig } from '@/lib/mcp/package-manager/config';
import { StreamableHTTPWrapper } from '@/lib/mcp/transports/StreamableHTTPWrapper';
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
      }
      // Don't re-throw or log abort errors at all
      return;
    }
    // For other transport types, log the error
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
  
  // Check if this is an authenticated mcp-remote server that needs OAuth directory access
  const isMcpRemoteWithOAuth = serverConfig.command === 'npx' && 
                               serverConfig.args?.includes('mcp-remote') &&
                               (serverConfig.config as any)?.oauth_completed_at;
  
  // For authenticated mcp-remote servers, use their OAuth directory as HOME
  const oauthHome = isMcpRemoteWithOAuth && serverConfig.uuid
    ? path.join(PackageManagerConfig.PACKAGE_STORE_DIR, 'servers', serverConfig.uuid, 'oauth')
    : actualHome;
  
  const paths: PathConfig = {
    userHome: process.env.FIREJAIL_USER_HOME ?? oauthHome,
    localBin: process.env.FIREJAIL_LOCAL_BIN ?? path.join(actualHome, '.local', 'bin'),
    appPath: process.env.FIREJAIL_APP_PATH ?? process.cwd(),
    mcpWorkspace: process.env.FIREJAIL_MCP_WORKSPACE ?? path.join(actualHome, 'mcp-workspace')
  };
  
  // Ensure workspace directory exists
  try {
    fs.mkdirSync(paths.mcpWorkspace, { recursive: true });
  } catch (err) {
  }

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
    
    // For mcp-remote OAuth, bind mount the OAuth directory
    ...(isMcpRemoteWithOAuth && paths.userHome !== oauthHome ? ['--bind', paths.userHome, paths.userHome] : []),
    
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
    
    // Python-specific bindings (use try variants for directories that might not exist)
    '--ro-bind-try', '/usr/lib/python3', '/usr/lib/python3',
    '--ro-bind-try', '/usr/lib/python3.12', '/usr/lib/python3.12',
    '--ro-bind-try', '/usr/local/lib/python3', '/usr/local/lib/python3',
    '--ro-bind-try', '/usr/local/lib/python3.12', '/usr/local/lib/python3.12',
    
    // User's local bin directory
    '--ro-bind', paths.localBin, paths.localBin,
    
    // Pipx venvs directory (needed for uvx and other pipx-installed tools)
    '--ro-bind-try', `${paths.userHome}/.local/share/pipx`, `${paths.userHome}/.local/share/pipx`,
    
    // UV tools directory (needs write access for uvx)
    '--bind', `${paths.userHome}/.local/share/uv`, `${paths.userHome}/.local/share/uv`,
    
    // MCP Interpreter directories (mount from config)
    '--ro-bind', PackageManagerConfig.NODEJS_BIN_DIR, PackageManagerConfig.NODEJS_BIN_DIR,
    '--ro-bind', PackageManagerConfig.PYTHON_BIN_DIR, PackageManagerConfig.PYTHON_BIN_DIR,
    '--ro-bind', PackageManagerConfig.DOCKER_BIN_DIR, PackageManagerConfig.DOCKER_BIN_DIR,
    
    // NVM directories for pnpm support (try variants since NVM might not be installed)
    '--ro-bind-try', `${actualHome}/.nvm`, `${actualHome}/.nvm`,
    
    // UV cache directory
    '--bind', `${paths.userHome}/.cache/uv`, `${paths.userHome}/.cache/uv`,
    
    // MCP package store directory (needed for uvx and other package managers)
    '--bind', PackageManagerConfig.PACKAGE_STORE_DIR, PackageManagerConfig.PACKAGE_STORE_DIR,
    
    // Docker socket (only if not using network isolation, use try variant since Docker might not be installed)
    ...(PackageManagerConfig.ENABLE_NETWORK_ISOLATION ? [] : ['--ro-bind-try', '/var/run/docker.sock', '/var/run/docker.sock']),
    
    // User/group mapping for user namespace
    '--uid', '1000',
    '--gid', '1000',
    
    // Note: --rlimit is not supported in bubblewrap < 0.5.0
    
    // Security capabilities
    '--cap-drop', 'ALL',
    
    // Set hostname
    '--hostname', 'mcp-sandbox',
  ];

  // Use the original command name
  const commandToExecute = serverConfig.command;

  // Try to find pnpm in the system
  let pnpmPath = '';
  try {
    const pnpmLocation = execSync('which pnpm', { encoding: 'utf8', stdio: 'pipe' }).trim();
    if (pnpmLocation) {
      pnpmPath = path.dirname(pnpmLocation);
    }
  } catch (e) {
    // pnpm not found, fallback to including common nvm paths
    pnpmPath = `${actualHome}/.nvm/versions/node/v22.17.0/bin:${actualHome}/.nvm/versions/node/v20.18.2/bin`;
  }

  // Construct the final environment
  const finalEnv = {
    // Sensible defaults - include interpreter paths from config
    PATH: `${paths.localBin}:${pnpmPath}:${PackageManagerConfig.NODEJS_BIN_DIR}:${PackageManagerConfig.PYTHON_BIN_DIR}:${PackageManagerConfig.DOCKER_BIN_DIR}:/usr/local/bin:/usr/bin:/bin`,
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
    // PNPM specific
    PNPM_STORE_DIR: PackageManagerConfig.PNPM_STORE_DIR,
    NODE_ENV: 'production',
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
  
  // Check if this is an authenticated mcp-remote server that needs OAuth directory access
  const isMcpRemoteWithOAuth = serverConfig.command === 'npx' && 
                               serverConfig.args?.includes('mcp-remote') &&
                               (serverConfig.config as any)?.oauth_completed_at;
  
  // For authenticated mcp-remote servers, use their OAuth directory as HOME
  const oauthHome = isMcpRemoteWithOAuth && serverConfig.uuid
    ? path.join(PackageManagerConfig.PACKAGE_STORE_DIR, 'servers', serverConfig.uuid, 'oauth')
    : actualHome;
  
  const paths: PathConfig = {
    userHome: process.env.FIREJAIL_USER_HOME ?? oauthHome,
    localBin: process.env.FIREJAIL_LOCAL_BIN ?? path.join(actualHome, '.local', 'bin'),
    appPath: process.env.FIREJAIL_APP_PATH ?? process.cwd(),
    mcpWorkspace: process.env.FIREJAIL_MCP_WORKSPACE ?? path.join(actualHome, 'mcp-workspace')
  };
  
  // Ensure workspace directory exists
  try {
    fs.mkdirSync(paths.mcpWorkspace, { recursive: true });
  } catch (err) {
  }
  
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
      `--whitelist=${PackageManagerConfig.NODEJS_BIN_DIR}`, // Allow Node.js interpreters
      `--whitelist=${PackageManagerConfig.PYTHON_BIN_DIR}`, // Allow Python interpreters  
      `--whitelist=${PackageManagerConfig.DOCKER_BIN_DIR}`, // Allow Docker
      `--whitelist=${paths.mcpWorkspace}`, // Allow workspace access
      `--whitelist=${actualHome}/.nvm`, // Allow nvm directory for pnpm
      '--whitelist=/usr/lib/python*', // Python libs
      '--whitelist=/usr/local/lib/python*',
      `--whitelist=${paths.userHome}/.cache/uv`, // UV cache
      `--whitelist=${paths.userHome}/.venv`, // Virtual envs
      // For mcp-remote OAuth, ensure access to .mcp-auth directory
      ...(isMcpRemoteWithOAuth ? [`--whitelist=${paths.userHome}/.mcp-auth`] : []),
      
      // Docker socket (only if not using network isolation)
      ...(PackageManagerConfig.ENABLE_NETWORK_ISOLATION ? [] : [`--whitelist=/var/run/docker.sock`]),

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

  // Try to find pnpm in the system for firejail
  let pnpmPathFirejail = '';
  try {
    const pnpmLocation = execSync('which pnpm', { encoding: 'utf8', stdio: 'pipe' }).trim();
    if (pnpmLocation) {
      pnpmPathFirejail = path.dirname(pnpmLocation);
    }
  } catch (e) {
    // pnpm not found, fallback to including common nvm paths
    pnpmPathFirejail = `${actualHome}/.nvm/versions/node/v22.17.0/bin:${actualHome}/.nvm/versions/node/v20.18.2/bin`;
  }

  // Construct the final environment, prioritizing serverConfig.env
  const finalEnv = {
    // Sensible defaults, adjust user/home if needed - include interpreter paths from config
    PATH: `${paths.localBin}:${pnpmPathFirejail}:${PackageManagerConfig.NODEJS_BIN_DIR}:${PackageManagerConfig.PYTHON_BIN_DIR}:${PackageManagerConfig.DOCKER_BIN_DIR}:/usr/local/bin:/usr/bin:/bin`,
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
    // PNPM specific
    PNPM_STORE_DIR: PackageManagerConfig.PNPM_STORE_DIR,
    NODE_ENV: 'production',
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

  // Check if this is an mcp-remote server (regardless of the configured type)
  const isMcpRemoteServer = serverConfig.args?.some(arg => arg === 'mcp-remote') || false;
  
  if (isMcpRemoteServer) {
  }

  try {
    // Force STDIO transport for mcp-remote servers
    if (serverConfig.type === McpServerType.STDIO || isMcpRemoteServer) {
      // For mcp-remote servers, ensure we have a command
      if (!serverConfig.command && isMcpRemoteServer) {
        serverConfig.command = 'npx';
      }
      
      if (!serverConfig.command) {
        return null;
      }
      
      // Validate command for security
      const commandValidation = validateCommand(serverConfig.command);
      if (!commandValidation.valid) {
        throw new Error(`Invalid command: ${commandValidation.error}`);
      }

      // Validate command arguments
      if (serverConfig.args) {
        const argsValidation = validateCommandArgs(serverConfig.args);
        if (!argsValidation.valid) {
          throw new Error(`Invalid arguments: ${argsValidation.error}`);
        }
      }

      // Transform command for package managers (npx, uvx, etc.)
      let transformedCommand = serverConfig.command;
      let transformedArgs = serverConfig.args || [];
      let packageManagerEnv: Record<string, string> = {};
      
      // Skip transformation if requested (e.g., during discovery)
      if (!skipCommandTransformation) {
        try {
          const transformation = await packageManager.transformCommand(
            serverConfig.command,
            serverConfig.args || [],
            serverConfig.uuid || serverConfig.name // Use UUID if available, fallback to name
          );
          
          transformedCommand = transformation.command;
          transformedArgs = transformation.args;
          packageManagerEnv = transformation.env || {};
        } catch (error) {
          // Log more details about the failure
          console.error(`[MCP Wrapper] Command transformation details:`, {
            command: serverConfig.command,
            args: serverConfig.args,
            error: error instanceof Error ? error.message : String(error)
          });
          // Continue with original command if transformation fails
        }
      } else {
        
        // Even in discovery mode, we need to set up proper environment for uvx
        if (serverConfig.command === 'uvx') {
          const serverUuid = serverConfig.uuid || serverConfig.name;
          const installDir = path.join(PackageManagerConfig.PACKAGE_STORE_DIR, 'servers', serverUuid, 'uv');
          packageManagerEnv = {
            UV_PROJECT_ENVIRONMENT: `${installDir}/.venv`,
            UV_CACHE_DIR: PackageManagerConfig.UV_CACHE_DIR,
          };
        }
      }

      // Check if this is a Docker-based server that needs direct socket access
      const isDockerServer = 
        transformedCommand === 'docker' || 
        (transformedCommand === 'uvx' && 
         transformedArgs.some(arg => arg.toLowerCase().includes('docker')));
      
      if (isDockerServer) {
      }

      // Apply sandboxing by default for all STDIO servers (unless explicitly disabled)
      let sandboxConfig: FirejailConfig | null = null;
      // Only skip sandboxing if explicitly set to false or if it's a Docker server
      if (serverConfig.applySandboxing !== false && serverConfig.type === McpServerType.STDIO && !isDockerServer) {
        // Package manager config is imported at the top
        
        // Check availability of isolation tools
        const [bwrapAvailable, firejailAvailable] = await Promise.all([
          isCommandAvailable('bwrap'),
          isCommandAvailable('firejail')
        ]);
        
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
          }
        } else if (PackageManagerConfig.ISOLATION_TYPE === 'bubblewrap' && !bwrapAvailable && firejailAvailable) {
          // Bubblewrap was requested but not available, try fallback
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
          }
        } else {
          // No isolation tools available
        }
      }

      // Check if this is an authenticated mcp-remote server that needs OAuth directory access
      const isMcpRemoteWithOAuth = serverConfig.command === 'npx' && 
                                   serverConfig.args?.includes('mcp-remote') &&
                                   (serverConfig.config as any)?.oauth_completed_at;
      
      // For authenticated mcp-remote servers, use their OAuth directory as HOME
      const oauthHome = isMcpRemoteWithOAuth && serverConfig.uuid
        ? path.join(PackageManagerConfig.PACKAGE_STORE_DIR, 'servers', serverConfig.uuid, 'oauth')
        : (process.env.HOME || os.homedir() || '/app');

      const stdioParams: StdioServerParameters = sandboxConfig ? {
        // Use sandbox configuration (default for STDIO servers)
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
            PATH: `${process.env.FIREJAIL_LOCAL_BIN ?? path.join(oauthHome, '.local/bin')}:${process.env.PATH}`, // Prepend local bin
            HOME: process.env.FIREJAIL_USER_HOME ?? oauthHome,
            UV_ROOT: `${process.env.FIREJAIL_USER_HOME ?? oauthHome}/.local/uv`,
            PYTHONPATH: `${process.env.FIREJAIL_MCP_WORKSPACE ?? path.join(oauthHome, 'mcp-workspace')}/lib/python`,
            PYTHONUSERBASE: process.env.FIREJAIL_MCP_WORKSPACE ?? path.join(oauthHome, 'mcp-workspace'),
            UV_SYSTEM_PYTHON: 'true',
          } : {}),
          // Set OAuth HOME for all platforms if needed
          ...(isMcpRemoteWithOAuth ? { HOME: oauthHome } : {}),
          // Apply package manager env
          ...packageManagerEnv,
          // Apply server-specific env vars, overriding anything above
          ...(serverConfig.env || {})
        }
      };
      
      try {
        transport = new StdioClientTransport(stdioParams);
      } catch (error) {
        
        // Check if the command exists
        const commandExists = await isCommandAvailable(stdioParams.command);
        if (!commandExists) {
          
          // Provide helpful suggestions
          if (stdioParams.command === 'npx') {
          } else if (stdioParams.command === 'uvx' || stdioParams.command === 'uv') {
          }
        }
        
        throw error;
      }
    } else if (serverConfig.type === McpServerType.SSE && !isMcpRemoteServer) {
      // Log deprecation warning
      
      if (!serverConfig.url) {
        return null;
      }
      
      // Validate URL for security
      const urlValidation = validateMcpUrl(serverConfig.url);
      if (!urlValidation.valid) {
        throw new Error(`Invalid URL: ${urlValidation.error}`);
      }
      
      transport = new SSEClientTransport(urlValidation.parsedUrl!);
    } else if (serverConfig.type === McpServerType.STREAMABLE_HTTP && !isMcpRemoteServer) {
      if (!serverConfig.url) {
        return null;
      }
      
      // Validate URL for security
      const urlValidation = validateMcpUrl(serverConfig.url);
      if (!urlValidation.valid) {
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
              streamableOptions = {};
            }
          } catch (e) {
            // Provide explicit fallback instead of silent failure
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
        
        
        // Use our wrapper to capture session IDs
        if (serverConfig.uuid && serverConfig.profile_uuid) {
          transport = await StreamableHTTPWrapper.create(
            url, 
            transportOptions,
            serverConfig.uuid,
            serverConfig.profile_uuid
          );
        } else {
          // Fallback to direct transport if we don't have server/profile UUIDs
          transport = new StreamableHTTPClientTransport(url, transportOptions);
        }
      } catch (error) {
        throw error; // Propagate the error instead of falling back
      }
    } else {
      return null;
    }

    if (!transport) {
      return null;
    }

    const client = new Client(
      { name: clientName, version: clientVersion },
      { capabilities: { tools: {}, resources: {}, prompts: {} } } // Assume all capabilities initially
    );

    return { client, transport };

  } catch (error) {
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
                  }
                }
              };
              
              const closeClient = async () => {
                try {
                  await client.close();
                } catch (e: any) {
                  // Silently ignore all errors for Streamable HTTP client
                  if (e?.code !== 20 && e?.name !== 'AbortError') {
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
          } catch (cleanupError) {
          }
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Ensure client/transport are closed before retry
      if (attempt > 0) {
        // Only close if we're using retry-created instances
        try { 
          await transport.close(); 
        } catch (e: any) { 
          // Ignore abort errors
          if (e?.code !== 20 && e?.name !== 'AbortError') {
          }
        }
        try { 
          await client.close(); 
        } catch (e: any) { 
          // Ignore abort errors
          if (e?.code !== 20 && e?.name !== 'AbortError') {
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
             return [];
        }
        // Log and re-throw other errors
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
             return [];
        }
        // Log and re-throw other errors
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
             return [];
        }
        // Log and re-throw other errors
        throw error; // Re-throw the error to be handled by the caller
    } finally {
        await safeCleanup(connectedClient, serverConfig);
    }
}


// TODO: Add functions for callTool, readResource, getPrompt etc. as needed, reusing create/connect logic.
