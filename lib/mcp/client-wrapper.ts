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
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import os from 'os';
import path from 'path';

// Internal application imports
import { McpServerType } from '@/db/schema'; // Assuming McpServerType enum is here
import { approvedChildPath, inheritableChildEnv } from '@/lib/mcp/child-env';
import { packageManager } from '@/lib/mcp/package-manager';
import { PackageManagerConfig } from '@/lib/mcp/package-manager/config';
import { safeMcpFetch } from '@/lib/mcp/safe-fetch';
import {
  refuseUnsandboxedStart,
  resolveSandboxLauncher,
  splitServerEnv,
  TRUSTED_LAUNCHER_DIRS,
} from '@/lib/mcp/sandbox-launcher';
import { StreamableHTTPWrapper } from '@/lib/mcp/transports/StreamableHTTPWrapper';
import { buildSecurePath, buildServerScopedPath, validatePathComponent } from '@/lib/secure-path-builder';
import { validateCommand, validateCommandArgs, validateHeaders, validateMcpUrl } from '@/lib/security/validators';
import type { McpServer } from '@/types/mcp-server'; // Assuming McpServer type is defined here

/**
 * ============================================================================
 * Max Listeners Configuration for MCP STDIO Connections
 * ============================================================================
 *
 * PROBLEM:
 * Each STDIO MCP server connection spawns a child process via the MCP SDK's
 * StdioClientTransport. These child processes register 'exit' event listeners
 * on the global Node.js process object. With multiple servers being discovered
 * simultaneously, we can exceed the default EventEmitter limit of 10 listeners,
 * triggering MaxListenersExceededWarning.
 *
 * WHY GLOBAL setMaxListeners:
 * The MCP SDK manages child process spawning internally through StdioClientTransport.
 * We don't have direct access to these child processes to set listeners on them
 * individually. The SDK's internal architecture requires us to set the limit
 * globally on the process object.
 *
 * MEMORY LEAK CONCERNS:
 * - The MCP SDK handles proper cleanup of child processes and their listeners
 * - When a client disconnects, the SDK's cleanup() method kills the child process
 *   and removes event listeners automatically
 * - We implement additional safety via the safeCleanup() function that ensures
 *   proper disposal of all MCP client connections
 * - The limit of 50 is reasonable for typical deployments (users rarely have
 *   50+ STDIO servers configured simultaneously)
 *
 * ALTERNATIVE APPROACHES CONSIDERED:
 * - Setting maxListeners on individual child processes: Not possible - SDK
 *   doesn't expose them
 * - Manual child process tracking: Not practical - would require forking/patching
 *   the SDK
 * - Using different transport types: STDIO is required for many MCP servers
 *
 * CONCLUSION:
 * Global setMaxListeners is the only practical solution given the SDK's
 * architecture. Memory leak risk is minimal due to SDK's internal cleanup
 * mechanisms and our own safeCleanup() wrapper.
 * ============================================================================
 */
const MAX_CONCURRENT_MCP_CONNECTIONS = 50;
if (typeof process !== 'undefined' && process.setMaxListeners) {
  process.setMaxListeners(MAX_CONCURRENT_MCP_CONNECTIONS);
}

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
      // Completely ignore abort errors - they're expected during cleanup
      if (cleanupError?.code === 20 || 
          cleanupError?.name === 'AbortError' || 
          cleanupError?.message?.includes('abort') ||
          cleanupError?.message?.includes('This operation was aborted')) {
        return; // Silent return for expected abort errors
      }
      // Only log unexpected errors for debugging
      console.debug('[MCP] Unexpected Streamable HTTP cleanup error:', cleanupError?.message);
      return;
    }
    // For other transport types, log the error
    console.warn('[MCP] Cleanup error for', serverConfig.name, ':', cleanupError?.message);
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Validate UUID format to prevent path traversal
 */
function validateUUID(uuid: string | undefined): void {
  if (!uuid) return;

  // UUID format validation (any version): xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  // Accepts any UUID-shaped string (hex digits and dashes in correct positions)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(uuid)) {
    throw new Error('Invalid UUID format');
  }
}

/**
 * A path inside one server's own directory, <store>/servers/<uuid>. That
 * directory is bind-mounted writable into the server's sandbox, so its child
 * can replace anything in it with a symlink; the scoped builder refuses one
 * that leads out of it, into another server's directory included.
 */
function serverPath(uuid: string, ...components: string[]): string {
  validateUUID(uuid);
  return buildServerScopedPath(PackageManagerConfig.PACKAGE_STORE_DIR, uuid, ...components);
}

function privateRuntimeCaches(serverConfig: McpServer): Record<string, string> {
  if (!serverConfig.uuid) throw new Error('A server UUID is required for sandbox isolation');
  const workspace = serverPath(serverConfig.uuid, 'workspace');
  return {
    UV_CACHE_DIR: path.join(workspace, '.cache/uv'),
    PNPM_STORE_DIR: path.join(workspace, '.cache/pnpm'),
  };
}

// Check if a command is available on the system
async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    // Validate command name (alphanumeric, dash, underscore, dot only)
    if (!/^[a-zA-Z0-9._-]+$/.test(command)) {
      return false;
    }

    // Use which/where to check command availability (works cross-platform)
    // 'which' is POSIX standard, 'where' is Windows equivalent
    const whichCommand = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(whichCommand, [command], { stdio: 'ignore' });
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
/**
 * Does this server need the raw Docker socket, and therefore no sandbox?
 *
 * Only the `docker` binary itself. This used to also return true for any `uvx`
 * server with "docker" as a *substring* of any argument, which meant
 * `docker-utils`, `mcp-docker-helper` or `--from x-docker-y` ran with no
 * bubblewrap or firejail at all — the whole isolation, disabled by a package
 * name. A uvx package is not Docker; it runs under uv like every other one.
 *
 * A server that genuinely wraps Docker cannot be sandboxed, so — like one with
 * `applySandboxing: false` — createMcpClientAndTransport starts it only under
 * the operator opt-out, MCP_ALLOW_UNSANDBOXED_STDIO=true.
 */
export function requiresDockerSocket(command: string, _args: string[]): boolean {
  return command === 'docker';
}

/**
 * The launcher to spawn, as an absolute path from a fixed system directory.
 * Never a bare name: that was resolved through the launch environment's PATH,
 * which the server's configuration and the package manager both write. When
 * the launcher is not installed this is still an absolute path, so the spawn
 * fails instead of finding something else.
 */
function sandboxLauncherPath(name: 'bwrap' | 'firejail'): string {
  return resolveSandboxLauncher(name) ?? path.join(TRUSTED_LAUNCHER_DIRS[0], name);
}

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

  // Use server-specific directories for all MCP operations
  // This ensures OAuth tokens, workspace files, and other data are isolated per server
  let serverSpecificHome: string;
  if (serverConfig.uuid) {
    // Validated, and anchored at the server's own directory
    serverSpecificHome = serverPath(serverConfig.uuid, 'workspace');
  } else {
    serverSpecificHome = buildSecurePath(actualHome, 'mcp-workspace');
  }
  
  const paths: PathConfig = {
    userHome: process.env.FIREJAIL_USER_HOME ?? serverSpecificHome,
    localBin: process.env.FIREJAIL_LOCAL_BIN ?? buildSecurePath(actualHome, '.local', 'bin'),
    appPath: process.env.FIREJAIL_APP_PATH ?? process.cwd(),
    mcpWorkspace: process.env.FIREJAIL_MCP_WORKSPACE ?? serverSpecificHome
  };
  
  // Ensure workspace directory exists
  try {
    fs.mkdirSync(paths.mcpWorkspace, { recursive: true });
  } catch (err) {
  }

  // The server's own directory is mounted read-only below; its OAuth
  // directory (mcp-remote keeps tokens there) is re-mounted writable, so it
  // must exist before launch — the child cannot create it.
  const serverDirs = serverConfig.uuid
    ? { root: serverPath(serverConfig.uuid), oauth: serverPath(serverConfig.uuid, 'oauth') }
    : null;
  if (serverDirs) {
    fs.mkdirSync(serverDirs.oauth, { recursive: true });
  }

  // privateRuntimeCaches puts the package caches in the server's own
  // workspace. By default that workspace is HOME and bound writable where it
  // is. When FIREJAIL_USER_HOME moves HOME it is bound at HOME's path instead,
  // leaving its own path visible only through the read-only server directory,
  // and every install fails with EROFS — so it is bound in place as well. Its
  // entry sits in that read-only directory, so the child cannot swap it for a
  // symlink before bwrap resolves it.
  const privateWorkspace =
    serverConfig.uuid && paths.userHome !== serverSpecificHome ? serverSpecificHome : null;
  if (privateWorkspace) {
    fs.mkdirSync(privateWorkspace, { recursive: true });
  }

  // By default HOME *is* the workspace bound below, so the per-tool
  // directories under HOME are already inside that bind. Binding them again
  // adds nothing but a host-side resolution of a path the child can turn into
  // a symlink — to /run/secrets, or another server's directory.
  const homeIsWorkspace = paths.userHome === paths.mcpWorkspace;

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
    
    // The server's own directory, read-only. It also holds this server's
    // package-manager installs, which the host writes and then executes; a
    // writable view let a running server swap them under the installer.
    ...(serverDirs ? ['--ro-bind', serverDirs.root, serverDirs.root] : []),

    // Then, on top of it, only what the server writes: the workspace as home,
    '--bind', paths.mcpWorkspace, paths.userHome,
    // and its OAuth directory (mcp-remote's HOME, where it keeps tokens).
    ...(serverDirs ? ['--bind', serverDirs.oauth, serverDirs.oauth] : []),
    // and, when HOME is elsewhere, the workspace holding its package caches.
    ...(privateWorkspace ? ['--bind', privateWorkspace, privateWorkspace] : []),

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
    
    // User's local bin directory.
    //
    // Tolerant, like the optional paths above and below it. This is a host
    // convention ($HOME/.local/bin) and it does not exist in the container
    // image, where the tools live in /usr/local/bin. bwrap aborts outright if a
    // --ro-bind source is missing, taking the child with it — which reached the
    // user as "MCP error -32000: Connection closed" and stopped every sandboxed
    // STDIO server from starting after the containerised cutover.
    '--ro-bind-try', paths.localBin, paths.localBin,
    
    // Pipx venvs directory (needed for uvx and other pipx-installed tools)
    // and UV tools directory (needs write access for uvx)
    ...(homeIsWorkspace ? [] : [
      '--ro-bind-try', `${paths.userHome}/.local/share/pipx`, `${paths.userHome}/.local/share/pipx`,
      '--bind-try', `${paths.userHome}/.local/share/uv`, `${paths.userHome}/.local/share/uv`,
    ]),
    
    // MCP Interpreter directories (mount from config)
    '--ro-bind', PackageManagerConfig.NODEJS_BIN_DIR, PackageManagerConfig.NODEJS_BIN_DIR,
    '--ro-bind', PackageManagerConfig.PYTHON_BIN_DIR, PackageManagerConfig.PYTHON_BIN_DIR,
    '--ro-bind', PackageManagerConfig.DOCKER_BIN_DIR, PackageManagerConfig.DOCKER_BIN_DIR,
    
    // NVM directories for pnpm support (try variants since NVM might not be installed)
    '--ro-bind-try', `${actualHome}/.nvm`, `${actualHome}/.nvm`,
    
    // UV cache directory
    ...(homeIsWorkspace ? [] : ['--bind-try', `${paths.userHome}/.cache/uv`, `${paths.userHome}/.cache/uv`]),
    
    // Only the server-specific directory above is mounted. The shared store
    // contains other tenants' packages and OAuth credentials; a Docker socket
    // would let a child bypass this filesystem boundary altogether.

    // User/group mapping for user namespace
    '--uid', '1000',
    '--gid', '1000',
    
    // Note: --rlimit is not supported in bubblewrap < 0.5.0
    
    // Security capabilities
    '--cap-drop', 'ALL',
    '--cap-add', 'CAP_NET_BIND_SERVICE',
    
    // Set hostname
    '--hostname', 'mcp-sandbox',
  ];

  // Use the original command name
  const commandToExecute = serverConfig.command;

  // Try to find pnpm in the system
  let pnpmPath = '';
  try {
    const pnpmLocation = execFileSync('which', ['pnpm'], { encoding: 'utf8', stdio: 'pipe' }).trim();
    if (pnpmLocation) {
      pnpmPath = path.dirname(pnpmLocation);
    }
  } catch (e) {
    // pnpm not found, fallback to including common nvm paths
    pnpmPath = `${actualHome}/.nvm/versions/node/v22.17.0/bin:${actualHome}/.nvm/versions/node/v20.18.2/bin`;
  }

  // Variables that act on the launcher itself only reach the sandboxed process.
  const { launcherEnv, sandboxOnlyEnv } = splitServerEnv(serverConfig.env);

  // Construct the final environment
  const finalEnv = {
    // Allowlisted host vars first: everything below deliberately overrides them
    ...inheritableChildEnv(),
    // Sensible defaults - include interpreter paths from config
    PATH: approvedChildPath([paths.localBin, pnpmPath]),
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
    // Apply server-specific env vars
    ...launcherEnv,
    ...privateRuntimeCaches(serverConfig),
  };

  return {
    command: sandboxLauncherPath('bwrap'),
    args: [
      ...baseBubblewrapArgs,
      ...Object.entries(sandboxOnlyEnv).flatMap(([key, value]) => ['--setenv', key, value]),
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

  // Use server-specific directories for all MCP operations
  // This ensures OAuth tokens, workspace files, and other data are isolated per server
  let serverSpecificHome: string;
  if (serverConfig.uuid) {
    // Validated, and anchored at the server's own directory
    serverSpecificHome = serverPath(serverConfig.uuid, 'workspace');
  } else {
    serverSpecificHome = buildSecurePath(actualHome, 'mcp-workspace');
  }
  
  const paths: PathConfig = {
    userHome: process.env.FIREJAIL_USER_HOME ?? serverSpecificHome,
    localBin: process.env.FIREJAIL_LOCAL_BIN ?? buildSecurePath(actualHome, '.local', 'bin'),
    appPath: process.env.FIREJAIL_APP_PATH ?? process.cwd(),
    mcpWorkspace: process.env.FIREJAIL_MCP_WORKSPACE ?? serverSpecificHome
  };
  
  // Ensure workspace directory exists
  try {
    fs.mkdirSync(paths.mcpWorkspace, { recursive: true });
  } catch (err) {
  }

  // As in createBubblewrapConfig: the server directory is read-only, bar its
  // workspace and its OAuth directory, which therefore must exist up front.
  const serverDirs = serverConfig.uuid
    ? { root: serverPath(serverConfig.uuid), oauth: serverPath(serverConfig.uuid, 'oauth') }
    : null;
  if (serverDirs) {
    fs.mkdirSync(serverDirs.oauth, { recursive: true });
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
      // For servers with OAuth, ensure access to OAuth directories
      ...(serverDirs ? [
        `--whitelist=${serverDirs.oauth}`,
        `--whitelist=${serverDirs.root}`,
        `--read-only=${serverDirs.root}`,
        `--read-write=${paths.mcpWorkspace}`,
        `--read-write=${serverDirs.oauth}`,
      ] : []),
      
      // No Docker socket: it is root on the host, and --net=none does not stop
      // a unix socket. The bubblewrap builder dropped it for the same reason.

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
    const pnpmLocation = execFileSync('which', ['pnpm'], { encoding: 'utf8', stdio: 'pipe' }).trim();
    if (pnpmLocation) {
      pnpmPathFirejail = path.dirname(pnpmLocation);
    }
  } catch (e) {
    // pnpm not found, fallback to including common nvm paths
    pnpmPathFirejail = `${actualHome}/.nvm/versions/node/v22.17.0/bin:${actualHome}/.nvm/versions/node/v20.18.2/bin`;
  }

  // Variables that act on the launcher itself only reach the sandboxed process.
  const { launcherEnv, sandboxOnlyEnv } = splitServerEnv(serverConfig.env);

  // Construct the final environment, prioritizing serverConfig.env
  const finalEnv = {
    // Allowlisted host vars first: everything below deliberately overrides them
    ...inheritableChildEnv(),
    // Sensible defaults, adjust user/home if needed - include interpreter paths from config
    PATH: approvedChildPath([paths.localBin, pnpmPathFirejail]),
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
    // Apply server-specific env vars, overriding inherited ones
    ...launcherEnv,
  };


  return {
    command: sandboxLauncherPath('firejail'),
    args: [
      ...baseFirejailArgs, // Firejail's own arguments first
      ...Object.entries(sandboxOnlyEnv).map(([key, value]) => `--env=${key}=${value}`),
      commandToExecute,   // Then the command firejail should execute
      ...(serverConfig.args || []) // Finally, the arguments for the original command
    ],
    env: finalEnv
  };
}


/**
 * The transport a stored configuration is actually run with.
 *
 * Remote records proxied through the mcp-remote CLI predate storing those as
 * STDIO. Running that CLI is a local process, so such a record is STDIO for
 * every purpose — sandboxing included — and it may only be that CLI. Choosing
 * STDIO from the marker while sandboxing only records *stored* as STDIO let any
 * command on an SSE or Streamable HTTP record run unsandboxed.
 */
export function resolveTransportType(serverConfig: McpServer): McpServerType | null {
  switch (serverConfig.type) {
    case McpServerType.STDIO:
      return McpServerType.STDIO;
    case McpServerType.SSE:
    case McpServerType.STREAMABLE_HTTP:
      if (!serverConfig.args?.includes('mcp-remote')) {
        return serverConfig.type;
      }
      if (serverConfig.command && serverConfig.command !== 'npx') {
        throw new Error('A remote server can only be proxied through `npx mcp-remote`');
      }
      return McpServerType.STDIO;
    default:
      return null;
  }
}

type SandboxKind = 'bubblewrap' | 'firejail';

interface SandboxLaunch extends FirejailConfig {
  kind: SandboxKind;
}

const isSandboxKind = (kind: string): kind is SandboxKind => kind === 'bubblewrap' || kind === 'firejail';

/**
 * The sandboxes that can isolate a STDIO server, in order: the configured
 * isolation, then the configured fallback, each only if its launcher is
 * installed. Empty when isolation is configured off (`none`) or nothing is
 * installed — which callers treat as a refusal, not as permission to run bare.
 */
function availableSandboxes(): SandboxKind[] {
  if (!isSandboxKind(PackageManagerConfig.ISOLATION_TYPE)) return [];
  return [PackageManagerConfig.ISOLATION_TYPE, PackageManagerConfig.ISOLATION_FALLBACK]
    .filter(isSandboxKind)
    .filter((kind) => resolveSandboxLauncher(kind === 'bubblewrap' ? 'bwrap' : 'firejail') !== null);
}

/** The sandboxed launch for a STDIO server, from the first sandbox that builds one. */
function buildSandboxLaunch(
  sandboxes: SandboxKind[],
  stdioConfig: McpServer,
  command: string,
  args: string[],
  packageManagerEnv: Record<string, string>
): SandboxLaunch | null {
  const launchConfig: McpServer = { ...stdioConfig, command, args };

  for (const kind of sandboxes) {
    const built = kind === 'bubblewrap' ? createBubblewrapConfig(launchConfig) : createFirejailConfig(launchConfig);
    if (built) {
      return { kind, command: built.command, args: built.args, env: { ...built.env, ...packageManagerEnv } };
    }
  }
  return null;
}

/**
 * The sandboxed launch for a STDIO server that is started somewhere other than
 * createMcpClientAndTransport — the playground, the mcp-remote OAuth helper —
 * chosen by the same policy: MCP_ISOLATION_TYPE, then MCP_ISOLATION_FALLBACK,
 * each only if its launcher is installed, and none for a record that opts out
 * of sandboxing.
 *
 * Null when nothing can isolate the server; the caller then applies
 * refuseUnsandboxedStart, as createMcpClientAndTransport does. Throws what the
 * builders throw (a server directory that is a symlink out of itself, one that
 * cannot be created), which the caller treats as a refusal of that server.
 */
export function sandboxedStdioLaunch(serverConfig: McpServer): SandboxLaunch | null {
  if (!serverConfig.command) return null;
  const sandboxes = serverConfig.applySandboxing === false ? [] : availableSandboxes();
  return buildSandboxLaunch(sandboxes, serverConfig, serverConfig.command, serverConfig.args ?? [], {});
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

  // Marks a (legacy) mcp-remote proxy, which may default its command to npx
  const isMcpRemoteServer = serverConfig.args?.some(arg => arg === 'mcp-remote') || false;

  try {
    const transportType = resolveTransportType(serverConfig);

    if (transportType === McpServerType.STDIO) {
      // Everything here starts a process, so it works on a copy normalised to
      // STDIO — what the sandbox builders isolate — rather than trusting the
      // stored type, and without mutating the caller's config.
      const stdioConfig: McpServer = {
        ...serverConfig,
        type: McpServerType.STDIO,
        command: serverConfig.command || (isMcpRemoteServer ? 'npx' : null),
      };

      if (!stdioConfig.command) {
        return null;
      }
      
      // Validate command for security
      const commandValidation = validateCommand(stdioConfig.command);
      if (!commandValidation.valid) {
        throw new Error(`Invalid command: ${commandValidation.error}`);
      }

      // Validate command arguments
      if (stdioConfig.args) {
        const argsValidation = validateCommandArgs(stdioConfig.args);
        if (!argsValidation.valid) {
          throw new Error(`Invalid arguments: ${argsValidation.error}`);
        }
      }

      // Decide how the process will be isolated before the package manager
      // runs, since its install happens on the host. A config asking to skip
      // isolation gets no sandbox, and is refused like one with none available.
      const sandboxes = stdioConfig.applySandboxing === false ? [] : availableSandboxes();
      if (sandboxes.length === 0) {
        refuseUnsandboxedStart(stdioConfig.name);
      }

      // Transform command for package managers (npx, uvx, etc.)
      let transformedCommand = stdioConfig.command;
      let transformedArgs = stdioConfig.args || [];
      let packageManagerEnv: Record<string, string> = {};
      
      // Skip transformation if requested (e.g., during discovery)
      if (!skipCommandTransformation) {
        try {
          const transformation = await packageManager.transformCommand(
            stdioConfig.command,
            stdioConfig.args || [],
            stdioConfig.uuid || stdioConfig.name // Use UUID if available, fallback to name
          );
          
          transformedCommand = transformation.command;
          transformedArgs = transformation.args;
          packageManagerEnv = transformation.env || {};
        } catch (error) {
          // Log more details about the failure
          console.error(`[MCP Wrapper] Command transformation details:`, {
            command: stdioConfig.command,
            args: stdioConfig.args,
            error: error instanceof Error ? error.message : String(error)
          });
          // Continue with original command if transformation fails
        }
      } else {
        
        // Even in discovery mode, we need to set up proper environment for uvx
        if (stdioConfig.command === 'uvx') {
          const serverUuid = stdioConfig.uuid || stdioConfig.name;
          // Use validatePathComponent since serverUuid could be a name (not necessarily UUID)
          validatePathComponent(serverUuid);
          const installDir = buildSecurePath(PackageManagerConfig.PACKAGE_STORE_DIR, 'servers', serverUuid, 'uv');
          packageManagerEnv = {
            UV_PROJECT_ENVIRONMENT: `${installDir}/.venv`,
            UV_CACHE_DIR: PackageManagerConfig.UV_CACHE_DIR,
          };
        }
      }

      // Skipping the sandbox is a decision, so it is made by one named
      // function with tests rather than inline.
      const isDockerServer = requiresDockerSocket(transformedCommand, transformedArgs);

      // Every process is sandboxed. One that cannot be — it needs the Docker
      // socket, or no sandbox builds on this platform — is treated exactly like
      // one with no sandbox available: refused, unless the operator opted out.
      const sandboxConfig = sandboxes.length === 0 || isDockerServer
        ? null
        : buildSandboxLaunch(sandboxes, stdioConfig, transformedCommand, transformedArgs, packageManagerEnv);

      if (!sandboxConfig && sandboxes.length > 0) {
        refuseUnsandboxedStart(stdioConfig.name);
      }

      // Get actual home directory for fallback
      const actualHome = process.env.HOME || os.homedir() || '/app';

      // For mcp-remote servers, ensure HOME points to OAuth directory
      const isMcpRemote = transformedCommand === 'npx' && transformedArgs?.includes('mcp-remote');
      const serverOAuthHome = stdioConfig.uuid && isMcpRemote
        ? path.join(PackageManagerConfig.PACKAGE_STORE_DIR, 'servers', stdioConfig.uuid, 'oauth')
        : actualHome;

      const stdioParams: StdioServerParameters = sandboxConfig ? {
        // Use sandbox configuration (default for STDIO servers)
        command: sandboxConfig.command,
        args: sandboxConfig.args,
        env: {
          ...sandboxConfig.env,
          // For mcp-remote, override HOME to OAuth directory
          ...(isMcpRemote && stdioConfig.uuid ? { HOME: serverOAuthHome } : {}),
          ...packageManagerEnv,
          // Enforce this after both package-manager and caller environment merges.
          ...(sandboxConfig.kind === 'bubblewrap' ? privateRuntimeCaches(stdioConfig) : {}),
        }
      } : {
        // Use transformed configuration
        command: transformedCommand,
        args: transformedArgs,
        env: {
          // Allowlisted host vars only - this process holds the app's secrets
          ...inheritableChildEnv(),
          // PATH is built from approved directories only, on every platform:
          // appending the host PATH would let a child resolve commands from
          // whatever directories this process happens to have, and would leave
          // non-Linux hosts with no PATH at all once the spread was removed.
          PATH: approvedChildPath([
            process.env.FIREJAIL_LOCAL_BIN ?? path.join(actualHome, '.local/bin'),
          ]),
          // Only add Linux-specific paths on Linux systems
          ...(process.platform === 'linux' ? {
            // Add potentially missing vars needed by uvx/python on Linux
            // Use dynamic home directory detection
            HOME: process.env.FIREJAIL_USER_HOME ?? serverOAuthHome,
            UV_ROOT: `${process.env.FIREJAIL_USER_HOME ?? actualHome}/.local/uv`,
            PYTHONPATH: `${process.env.FIREJAIL_MCP_WORKSPACE ?? path.join(actualHome, 'mcp-workspace')}/lib/python`,
            PYTHONUSERBASE: process.env.FIREJAIL_MCP_WORKSPACE ?? path.join(actualHome, 'mcp-workspace'),
            UV_SYSTEM_PYTHON: 'true',
          } : {}),
          // Apply package manager env
          ...packageManagerEnv,
          // Apply server-specific env vars, overriding anything above
          ...(stdioConfig.env || {})
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
    } else if (transportType === McpServerType.SSE) {
      // Log deprecation warning

      if (!serverConfig.url) {
        return null;
      }

      // Validate URL for security (allow localhost in development)
      const urlValidation = validateMcpUrl(serverConfig.url, {
        allowLocalhost: process.env.NODE_ENV === 'development' ||
                       process.env.ALLOW_LOCAL_MCP_SERVERS === 'true'
      });
      if (!urlValidation.valid) {
        throw new Error(`MCP Server URL validation failed for ${serverConfig.name}: ${urlValidation.error}`);
      }

      // Extract streamable HTTP options for OAuth support
      let streamableOptions: any = {};

      // Priority 1: Decrypted streamableHTTPOptions from dedicated column
      if (serverConfig.streamableHTTPOptions) {
        streamableOptions = serverConfig.streamableHTTPOptions;
      }
      // Priority 2: Legacy env.__streamableHTTPOptions (backward compatibility)
      else if (serverConfig.env?.__streamableHTTPOptions) {
        try {
          const parsed = JSON.parse(serverConfig.env.__streamableHTTPOptions);
          if (parsed && typeof parsed === 'object') {
            streamableOptions = parsed;
          }
        } catch (e) {
          console.error('[OAuth/SSE] Failed to parse legacy streamableHTTPOptions:', e);
          streamableOptions = {};
        }
      }

      // Create SSEClientTransport with OAuth headers if available
      const transportOptions: any = { url: urlValidation.parsedUrl! };

      if (streamableOptions?.headers && typeof streamableOptions.headers === 'object') {
        const headerValidation = validateHeaders(streamableOptions.headers);
        if (headerValidation.valid) {
          transportOptions.requestInit = {
            headers: headerValidation.sanitizedHeaders,
            cache: 'no-store' as RequestCache,
            next: { revalidate: 0 }
          };
        } else {
          console.warn('[OAuth/SSE] Invalid headers, skipping:', headerValidation.error);
        }
      }

      transport = new SSEClientTransport(transportOptions.url, {
        requestInit: transportOptions.requestInit,
        fetch: safeMcpFetch,
      });
    } else if (transportType === McpServerType.STREAMABLE_HTTP) {
      if (!serverConfig.url) {
        return null;
      }
      
      // Validate URL for security (allow localhost in development)
      const urlValidation = validateMcpUrl(serverConfig.url, {
        allowLocalhost: process.env.NODE_ENV === 'development' || 
                       process.env.ALLOW_LOCAL_MCP_SERVERS === 'true'
      });
      if (!urlValidation.valid) {
        throw new Error(`MCP Server URL validation failed for ${serverConfig.name}: ${urlValidation.error}`);
      }
      
      const url = urlValidation.parsedUrl!;
      
      try {
        // Extract streamable HTTP options from ALL possible sources
        let streamableOptions: any = {};

        // Priority 1: Decrypted streamableHTTPOptions from dedicated column
        if (serverConfig.streamableHTTPOptions) {
          streamableOptions = serverConfig.streamableHTTPOptions;
        }
        // Priority 2: Legacy env.__streamableHTTPOptions (backward compatibility)
        else if (serverConfig.env?.__streamableHTTPOptions) {
          try {
            const parsed = JSON.parse(serverConfig.env.__streamableHTTPOptions);
            // Validate the parsed options have expected structure
            if (parsed && typeof parsed === 'object') {
              streamableOptions = parsed;
            } else {
              streamableOptions = {};
            }
          } catch (e) {
            console.error('[OAuth] Failed to parse legacy streamableHTTPOptions:', e);
            streamableOptions = {};
          }
        }
        
        // Create StreamableHTTPClientTransport with options
        const transportOptions: any = {};
        
        // Set default headers for Streamable HTTP
        const defaultHeaders: Record<string, string> = {
          'Accept': 'application/json, text/event-stream',
          'User-Agent': 'Plugged.in MCP Client',
          'MCP-Protocol-Version': '2024-11-05'
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
            },
            // Disable Next.js fetch caching for MCP requests
            cache: 'no-store' as RequestCache,
            next: { revalidate: 0 }
          };
        } else {
          transportOptions.requestInit = {
            headers: defaultHeaders,
            // Disable Next.js fetch caching for MCP requests
            cache: 'no-store' as RequestCache,
            next: { revalidate: 0 }
          };
        }
        
        
        // Add session ID if provided
        if (streamableOptions?.sessionId && typeof streamableOptions.sessionId === 'string') {
          transportOptions.sessionId = streamableOptions.sessionId;
        }
        
        // Add a reasonable default timeout for all Streamable HTTP connections
        // This helps prevent indefinite hanging on slow servers
        // Context7 and similar servers might need longer timeouts for complex queries
        if (streamableOptions?.timeout && typeof streamableOptions.timeout === 'number') {
          transportOptions.timeout = streamableOptions.timeout;
        } else {
          // Use longer timeout for known slow servers
          const urlStr = url.toString().toLowerCase();
          if (urlStr.includes('context7.com') || urlStr.includes('smithery.ai')) {
            transportOptions.timeout = 60000; // 60 seconds for Context7/Smithery
          } else {
            transportOptions.timeout = 30000; // 30 seconds default
          }
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
          // Fallback to direct transport if we don't have server/profile UUIDs,
          // with the same SSRF-pinned fetch the wrapper uses
          transport = new StreamableHTTPClientTransport(url, { ...transportOptions, fetch: safeMcpFetch });
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
      // Empty capabilities object - MCP SDK v1.22.0+ handles capability
      // negotiation during connection. Client capabilities are optional
      // and will be populated based on server response.
      { capabilities: {} }
    );

    return { client, transport };

  } catch (error) {
    // Callers only see "failed to create"; a refused launch must be diagnosable.
    console.error(
      `[MCP Wrapper] Not starting MCP server "${serverConfig.name}":`,
      error instanceof Error ? error.message : String(error)
    );
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
