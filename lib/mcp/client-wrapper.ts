// Standard library imports (none in this case)

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

  const _isUvCommand = serverConfig.command === 'uv' || serverConfig.command === 'uvenv' || serverConfig.command === 'uvx';

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
        // Construct necessary env even when not using firejail, especially for uvx
        command: serverConfig.command,
        args: serverConfig.args || [],
        env: {
          // Start with parent process env
          ...(process.env as Record<string, string>),
          // Only add Linux-specific paths on Linux systems
          ...(process.platform === 'linux' ? {
            // Add potentially missing vars needed by uvx/python on Linux
            PATH: `${process.env.FIREJAIL_LOCAL_BIN ?? '/home/pluggedin/.local/bin'}:${process.env.PATH}`, // Prepend local bin
            HOME: process.env.FIREJAIL_USER_HOME ?? '/home/pluggedin',
            UV_ROOT: `${process.env.FIREJAIL_USER_HOME ?? '/home/pluggedin'}/.local/uv`,
            PYTHONPATH: `${process.env.FIREJAIL_MCP_WORKSPACE ?? '/home/pluggedin/mcp-workspace'}/lib/python`,
            PYTHONUSERBASE: process.env.FIREJAIL_MCP_WORKSPACE ?? '/home/pluggedin/mcp-workspace',
            UV_SYSTEM_PYTHON: 'true',
          } : {}),
          // Apply server-specific env vars, overriding anything above
          ...(serverConfig.env || {})
        }
      };

      transport = new StdioClientTransport(stdioParams);
    } else if (serverConfig.type === McpServerType.SSE) {
      if (!serverConfig.url) {
        console.error(`[MCP Wrapper] SSE server ${serverConfig.name} is missing URL.`);
        return null;
      }
      transport = new SSEClientTransport(new URL(serverConfig.url));
    } else if (serverConfig.type === McpServerType.STREAMABLE_HTTP) {
      if (!serverConfig.url) {
        console.error(`[MCP Wrapper] Streamable HTTP server ${serverConfig.name} is missing URL.`);
        return null;
      }
      
      const url = new URL(serverConfig.url);
      
      try {
        // Extract streamable HTTP options from env or directly from serverConfig
        let streamableOptions: any = {};
        
        // Check if options are in env (from database storage)
        if (serverConfig.env?.__streamableHTTPOptions) {
          try {
            streamableOptions = JSON.parse(serverConfig.env.__streamableHTTPOptions);
          } catch (e) {
            console.error('[MCP Wrapper] Failed to parse streamableHTTPOptions from env:', e);
          }
        }
        
        // Or use directly from serverConfig (from playground/runtime)
        if (serverConfig.streamableHTTPOptions) {
          streamableOptions = serverConfig.streamableHTTPOptions;
        }
        
        // Create StreamableHTTPClientTransport with options
        const transportOptions: any = {};
        
        // Add headers if provided
        if (streamableOptions.headers) {
          transportOptions.requestInit = {
            headers: streamableOptions.headers
          };
        }
        
        // Add session ID if provided
        if (streamableOptions.sessionId) {
          transportOptions.sessionId = streamableOptions.sessionId;
        }
        
        console.log(`[MCP Wrapper] Creating Streamable HTTP transport for server ${serverConfig.name}`);
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
  client: Client,
  transport: Transport,
  serverName: string,
  serverConfig: McpServer,
  retries = 2,
  delay = 1000
): Promise<ConnectedMcpClient> {
  let lastError: Error | null = null;
  let currentTransport = transport;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[MCP Wrapper] Retrying connection to ${serverName} (Attempt ${attempt})...`);
        await sleep(delay);
        
        // For StreamableHTTP, we need to create a new transport for retry
        if (serverConfig.type === McpServerType.STREAMABLE_HTTP && serverConfig.url) {
          const newClientData = createMcpClientAndTransport(serverConfig);
          if (newClientData?.transport) {
            currentTransport = newClientData.transport;
          }
        }
      }
      
      await client.connect(currentTransport);
      console.log(`[MCP Wrapper] Connected to ${serverName}.`);
      return {
        client,
        cleanup: async () => {
          try {
            await currentTransport.close();
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
      try { await currentTransport.close(); } catch { /* ignore */ }
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
    connectedClient = await connectMcpClient(clientData.client, clientData.transport, serverConfig.name || serverConfig.uuid, serverConfig);

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
    
    // Return tools as-is without transforming names
    // This ensures compatibility with clients that expect original tool names
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
    connectedClient = await connectMcpClient(clientData.client, clientData.transport, serverConfig.name || serverConfig.uuid, serverConfig);

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
        connectedClient = await connectMcpClient(clientData.client, clientData.transport, serverConfig.name || serverConfig.uuid, serverConfig);

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
        connectedClient = await connectMcpClient(clientData.client, clientData.transport, serverConfig.name || serverConfig.uuid, serverConfig);

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
