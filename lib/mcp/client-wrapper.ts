// Standard library imports (none in this case)

// Third-party library imports
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport, StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  ListResourcesResultSchema, // Added + Moved
  ListResourceTemplatesResultSchema,
  ListToolsResultSchema,
  Resource, // Added
  ResourceTemplate,
  Tool
} from '@modelcontextprotocol/sdk/types.js';

// Internal application imports
import { McpServerType } from '@/db/schema'; // Assuming McpServerType enum is here
import type { McpServer } from '@/types/mcp-server'; // Assuming McpServer type is defined here

// --- Configuration & Types ---

// Interface for the connected client and its cleanup function
interface ConnectedMcpClient {
  client: Client;
  cleanup: () => Promise<void>;
}

// --- Helper Functions ---

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
      const stdioParams: StdioServerParameters = {
        command: serverConfig.command,
        args: serverConfig.args || [],
        // Merge process.env with serverConfig.env, giving precedence to serverConfig.env
        env: {
          ...(process.env as Record<string, string>), // Inherit parent process environment (includes PATH)
          ...(serverConfig.env || {}), // Server-specific env vars override
        } as Record<string, string>,
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

// TODO: Add functions for callTool, readResource etc. as needed, reusing create/connect logic.
