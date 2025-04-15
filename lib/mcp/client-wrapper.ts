// Standard library imports (none in this case)

// Third-party library imports
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport, StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';
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

// Internal application imports
import { McpServerType } from '@/db/schema'; // Assuming McpServerType enum is here
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Add this function to handle firejail configuration
export function createFirejailConfig(
  serverConfig: McpServer
): FirejailConfig | null {
  // Only apply firejail on Linux
  if (process.platform !== 'linux') return null;
  // Only apply firejail to STDIO servers with a command
  if (serverConfig.type !== McpServerType.STDIO || !serverConfig.command) return null;

  // Read paths from environment variables with fallbacks
  const paths: PathConfig = {
    userHome: process.env.FIREJAIL_USER_HOME ?? '/home/pluggedin',
    localBin: process.env.FIREJAIL_LOCAL_BIN ?? '/home/pluggedin/.local/bin',
    appPath: process.env.FIREJAIL_APP_PATH ?? '/home/pluggedin/pluggedin-app',
    mcpWorkspace: process.env.FIREJAIL_MCP_WORKSPACE ?? '/home/pluggedin/mcp-workspace'
  };
  // Only apply firejail to STDIO servers with a command
  if (serverConfig.type !== McpServerType.STDIO || !serverConfig.command) return null;

  const isUvCommand = serverConfig.command === 'uv' || serverConfig.command === 'uvenv' || serverConfig.command === 'uvx';

  const baseFirejailArgs = [
    '--quiet',
    // Use --private=DIR to strictly cage the process within the workspace
    `--private=${paths.mcpWorkspace}`,
    '--noroot', // Disable root privileges

    // Network configuration - Ignore global, start with none, add filter
    '--ignore=net', // Ignore global config's network setting
    '--net=none',   // Start with no network interface
    '--netfilter', // Enable basic network filtering
    '--protocol=unix,inet,inet6',
    '--dns=1.1.1.1', // Use Cloudflare DNS, adjust if needed

    // Basic security
    '--seccomp', // Enable seccomp filter
    '--memory-deny-write-execute',
    '--restrict-namespaces',

    // Allow necessary paths (adjust these based on actual deployment)
    `--whitelist=${paths.localBin}`,
    // REMOVED: `--whitelist=${paths.appPath}`, - Prevent access to main app dir
    `--whitelist=${paths.mcpWorkspace}`, // Allow access only to the designated workspace

    // Python-specific directories (adjust versions if needed)
    '--whitelist=/usr/lib/python*',
    '--whitelist=/usr/local/lib/python*',
    `--whitelist=${paths.userHome}/.cache/uv`,
    `--whitelist=${paths.userHome}/.venv`, // Allow access to virtual environments

    // Read-only system directories
    '--read-only=/usr/bin',
    '--read-only=/usr/lib',
    '--read-only=/usr/local/bin',
    '--read-only=/usr/local/lib',

    // Allow specific /etc files needed by many tools
    '--private-etc=passwd,group,resolv.conf,ssl,ca-certificates,python*',

    // Temporary directory handling
    '--private-tmp',
    '--private-dev', // Create a new /dev

    // Additional security
    '--caps.drop=all', // Drop all capabilities
    '--disable-mnt', // Disable mount operations
    '--shell=none', // Prevent shell execution
  ];

  // Use full path for UV commands inside the jail
  const commandToExecute = isUvCommand ? `${paths.localBin}/${serverConfig.command}` : serverConfig.command;

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
      ...baseFirejailArgs,
      commandToExecute, // The original command becomes an argument to firejail
      ...(serverConfig.args || []) // Append original args
    ],
    env: finalEnv
  };
}


// --- Core Client Logic ---

/**
 * Creates an MCP Client instance and its corresponding transport based on server config.
 * Does not establish the connection yet.
 */
function createMcpClientAndTransport(serverConfig: McpServer): { client: Client; transport: Transport } | null {
  let transport: Transport | undefined;
  const clientName = 'PluggedinAppClient'; // Or get from config/package.json
  const clientVersion = '0.1.0'; // Or get from config/package.json

  try {
    if (serverConfig.type === McpServerType.STDIO) {
      if (!serverConfig.command) {
        console.error(`[MCP Wrapper] STDIO server ${serverConfig.name} is missing command.`);
        return null;
      }

      // Apply firejail sandboxing only if explicitly requested and applicable
      let firejailConfig: FirejailConfig | null = null;
      if (serverConfig.applySandboxing === true) { // Check for the flag
        firejailConfig = createFirejailConfig(serverConfig);
      }

      const stdioParams: StdioServerParameters = firejailConfig ? {
        // Use firejail configuration because applySandboxing was true
        command: firejailConfig.command,
        args: firejailConfig.args,
        env: firejailConfig.env
      } : {
        // Use original configuration (non-Linux or non-STDIO/command)
        command: serverConfig.command,
        args: serverConfig.args || [],
        env: {
          ...(process.env as Record<string, string>), // Inherit parent process environment
          ...(serverConfig.env || {}) // Server-specific env vars override
        }
      };

      transport = new StdioClientTransport(stdioParams);
    } else if (serverConfig.type === McpServerType.SSE) {
      if (!serverConfig.url) {
        console.error(`[MCP Wrapper] SSE server ${serverConfig.name} is missing URL.`);
        return null;
      }
      transport = new SSEClientTransport(new URL(serverConfig.url));
    } else {
      console.error(`[MCP Wrapper] Unsupported server type: ${serverConfig.type} for server ${serverConfig.name}`);
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
  client: Client,
  transport: Transport,
  serverName: string,
  retries = 2,
  delay = 1000
): Promise<ConnectedMcpClient> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[MCP Wrapper] Retrying connection to ${serverName} (Attempt ${attempt})...`);
        await sleep(delay);
      }
      await client.connect(transport);
      console.log(`[MCP Wrapper] Connected to ${serverName}.`);
      return {
        client,
        cleanup: async () => {
          try {
            await transport.close();
            await client.close();
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
      try { await transport.close(); } catch { /* ignore */ }
      try { await client.close(); } catch { /* ignore */ }
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
  const clientData = createMcpClientAndTransport(serverConfig);
  if (!clientData) {
    throw new Error(`Failed to create client/transport for server ${serverConfig.name || serverConfig.uuid}`);
  }

  let connectedClient: ConnectedMcpClient | undefined;
  try {
    connectedClient = await connectMcpClient(clientData.client, clientData.transport, serverConfig.name || serverConfig.uuid);

    // Check capabilities *after* connecting
    const capabilities = connectedClient.client.getServerCapabilities();
    if (!capabilities?.tools) {
        // console.log(`[MCP Wrapper] Server ${serverConfig.name || serverConfig.uuid} does not advertise tool support.`); // Removed console log
        return []; // Return empty list if tools are not supported
    }

    // Server claims to support tools, attempt the request
    const result = await connectedClient.client.request(
      { method: 'tools/list', params: {} },
      ListToolsResultSchema
    );
    return result.tools || [];
  } catch (error) {
    console.error(`[MCP Wrapper] Error listing tools from ${serverConfig.name || serverConfig.uuid}:`, error);
    throw error; // Re-throw the error to be handled by the caller
  } finally {
    await connectedClient?.cleanup();
  }
}

/**
 * Connects to a single MCP server and lists its resource templates.
 * Handles connection, listing, and cleanup.
 * @param serverConfig Configuration of the MCP server.
 * @returns A promise resolving to the list of resource templates or throwing an error.
 */
export async function listResourceTemplatesFromServer(serverConfig: McpServer): Promise<ResourceTemplate[]> {
    const clientData = createMcpClientAndTransport(serverConfig);
    if (!clientData) {
        throw new Error(`Failed to create client/transport for server ${serverConfig.name || serverConfig.uuid}`);
    }

    let connectedClient: ConnectedMcpClient | undefined;
    try {
    connectedClient = await connectMcpClient(clientData.client, clientData.transport, serverConfig.name || serverConfig.uuid);

    // Check capabilities *after* connecting
    const capabilities = connectedClient.client.getServerCapabilities();
    if (!capabilities?.resources) {
        // console.log(`[MCP Wrapper] Server ${serverConfig.name || serverConfig.uuid} does not advertise resource support (needed for templates).`); // Removed console log
        return []; // Return empty list if resources are not supported
    }

    // Server claims to support resources, attempt the request
    const result = await connectedClient.client.request(
            { method: 'resources/templates/list', params: {} },
            ListResourceTemplatesResultSchema
        );
        return result.resourceTemplates || [];
    } catch (error: any) { // Add type to error
        // Specifically handle "Method not found" for templates list as non-critical
        if (error?.code === -32601 && error?.message?.includes('Method not found')) {
             console.warn(`[MCP Wrapper] Server ${serverConfig.name || serverConfig.uuid} does not implement resources/templates/list. Returning empty array.`);
             return [];
        }
        // Log and re-throw other errors
        console.error(`[MCP Wrapper] Error listing resource templates from ${serverConfig.name || serverConfig.uuid}:`, error);
        throw error; // Re-throw the error to be handled by the caller
    } finally {
        await connectedClient?.cleanup();
    }
}

/**
 * Connects to a single MCP server and lists its static resources.
 * Handles connection, listing, and cleanup.
 * @param serverConfig Configuration of the MCP server.
 * @returns A promise resolving to the list of resources or throwing an error.
 */
export async function listResourcesFromServer(serverConfig: McpServer): Promise<Resource[]> {
    const clientData = createMcpClientAndTransport(serverConfig);
    if (!clientData) {
        throw new Error(`Failed to create client/transport for server ${serverConfig.name || serverConfig.uuid}`);
    }

    let connectedClient: ConnectedMcpClient | undefined;
    try {
        connectedClient = await connectMcpClient(clientData.client, clientData.transport, serverConfig.name || serverConfig.uuid);

        // Check capabilities *after* connecting
        const capabilities = connectedClient.client.getServerCapabilities();
        if (!capabilities?.resources) {
            // console.log(`[MCP Wrapper] Server ${serverConfig.name || serverConfig.uuid} does not advertise resource support.`); // Removed console log
            return []; // Return empty list if resources are not supported
        }

        // Server claims to support resources, attempt the request
        const result = await connectedClient.client.request(
            { method: 'resources/list', params: {} },
            ListResourcesResultSchema // Use the correct schema
        );
        return result.resources || [];
    } catch (error: any) { // Add type to error
        // Specifically handle "Method not found" for resources list as non-critical
        if (error?.code === -32601 && error?.message?.includes('Method not found')) {
             console.warn(`[MCP Wrapper] Server ${serverConfig.name || serverConfig.uuid} does not implement resources/list. Returning empty array.`);
             return [];
        }
        // Log and re-throw other errors
        console.error(`[MCP Wrapper] Error listing resources from ${serverConfig.name || serverConfig.uuid}:`, error);
        throw error; // Re-throw the error to be handled by the caller
    } finally {
        await connectedClient?.cleanup();
    }
}

/**
 * Connects to a single MCP server and lists its prompts.
 * Handles connection, listing, and cleanup.
 * @param serverConfig Configuration of the MCP server.
 * @returns A promise resolving to the list of prompts or throwing an error.
 */
export async function listPromptsFromServer(serverConfig: McpServer): Promise<Prompt[]> {
    const clientData = createMcpClientAndTransport(serverConfig);
    if (!clientData) {
        throw new Error(`Failed to create client/transport for server ${serverConfig.name || serverConfig.uuid}`);
    }

    let connectedClient: ConnectedMcpClient | undefined;
    try {
        connectedClient = await connectMcpClient(clientData.client, clientData.transport, serverConfig.name || serverConfig.uuid);

        // Check capabilities *after* connecting
        const capabilities = connectedClient.client.getServerCapabilities();
        if (!capabilities?.prompts) {
            // console.log(`[MCP Wrapper] Server ${serverConfig.name || serverConfig.uuid} does not advertise prompt support.`);
            return []; // Return empty list if prompts are not supported
        }

        // Server claims to support prompts, attempt the request
        const result = await connectedClient.client.request(
            { method: 'prompts/list', params: {} },
            ListPromptsResultSchema // Use the correct schema
        );
        return result.prompts || [];
    } catch (error: any) {
        // Specifically handle "Method not found" for prompts list as non-critical
        if (error?.code === -32601 && error?.message?.includes('Method not found')) {
             console.warn(`[MCP Wrapper] Server ${serverConfig.name || serverConfig.uuid} does not implement prompts/list. Returning empty array.`);
             return [];
        }
        // Log and re-throw other errors
        console.error(`[MCP Wrapper] Error listing prompts from ${serverConfig.name || serverConfig.uuid}:`, error);
        throw error; // Re-throw the error to be handled by the caller
    } finally {
        await connectedClient?.cleanup();
    }
}


// TODO: Add functions for callTool, readResource, getPrompt etc. as needed, reusing create/connect logic.
