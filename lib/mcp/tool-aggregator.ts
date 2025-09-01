import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { 
  mcpServersTable, 
  toolsTable, 
  McpServerStatus, 
  ToggleStatus 
} from '@/db/schema';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { staticTools } from './tools/static-tools';

/**
 * Tool Aggregator for MCP
 * Aggregates tools from multiple sources with server name prefixing
 */
export class ToolAggregator {
  private static instance: ToolAggregator;

  private constructor() {}

  static getInstance(): ToolAggregator {
    if (!ToolAggregator.instance) {
      ToolAggregator.instance = new ToolAggregator();
    }
    return ToolAggregator.instance;
  }

  /**
   * Sanitize server name for use as tool prefix
   */
  private sanitizeServerName(name: string): string {
    // Convert to lowercase and replace non-alphanumeric chars with hyphens
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Get all tools for a specific profile
   * @param profileUuid - The profile UUID to get tools for
   * @returns Array of tools with server prefixes for dynamic tools
   */
  async getToolsForProfile(profileUuid?: string): Promise<Tool[]> {
    const tools: Tool[] = [];
    
    // 1. Always include static tools (no prefix needed)
    tools.push(...staticTools);
    
    // 2. If no profile, return only static tools
    if (!profileUuid) {
      console.log('[ToolAggregator] No profile UUID provided, returning static tools only');
      return tools;
    }
    
    try {
      // 3. Query database for active MCP servers in profile
      const servers = await db
        .select({
          uuid: mcpServersTable.uuid,
          name: mcpServersTable.name,
          status: mcpServersTable.status
        })
        .from(mcpServersTable)
        .where(and(
          eq(mcpServersTable.profile_uuid, profileUuid),
          eq(mcpServersTable.status, McpServerStatus.ACTIVE)
        ));
      
      console.log(`[ToolAggregator] Found ${servers.length} active MCP servers for profile ${profileUuid}`);
      
      // 4. For each server, fetch its active tools
      for (const server of servers) {
        const serverTools = await db
          .select({
            name: toolsTable.name,
            description: toolsTable.description,
            toolSchema: toolsTable.toolSchema,
            status: toolsTable.status
          })
          .from(toolsTable)
          .where(and(
            eq(toolsTable.mcp_server_uuid, server.uuid),
            eq(toolsTable.status, ToggleStatus.ACTIVE)
          ));
        
        console.log(`[ToolAggregator] Found ${serverTools.length} active tools for server ${server.name}`);
        
        // 5. Prefix tool names to avoid collisions
        const serverAlias = this.sanitizeServerName(server.name);
        console.log(`[ToolAggregator] Server "${server.name}" sanitized to "${serverAlias}"`);
        
        for (const tool of serverTools) {
          // Create prefixed tool name
          const prefixedName = `${serverAlias}__${tool.name}`;
          console.log(`[ToolAggregator] Adding tool "${tool.name}" as "${prefixedName}"`);
          
          // Add tool with prefix and metadata
          tools.push({
            name: prefixedName,
            description: tool.description || `${tool.name} from ${server.name}`,
            inputSchema: tool.toolSchema as any,
            // Store metadata for tool execution routing
            _originalName: tool.name,
            _serverUuid: server.uuid,
            _serverName: server.name
          } as Tool & { _originalName: string; _serverUuid: string; _serverName: string });
        }
      }
      
      console.log(`[ToolAggregator] Returning ${tools.length} total tools (${staticTools.length} static + ${tools.length - staticTools.length} dynamic)`);
      
    } catch (error) {
      console.error('[ToolAggregator] Error fetching dynamic tools:', error);
      // Return at least static tools on error
    }
    
    return tools;
  }

  /**
   * Parse a prefixed tool name to get server and original tool name
   * @param prefixedName - The prefixed tool name (e.g., "github__create_issue")
   * @returns Object with serverAlias and toolName, or null if not prefixed
   */
  parsePrefixedToolName(prefixedName: string): { serverAlias: string; toolName: string } | null {
    // Check if tool name has double underscore separator
    if (!prefixedName.includes('__')) {
      return null;
    }
    
    const [serverAlias, ...toolParts] = prefixedName.split('__');
    const toolName = toolParts.join('__'); // Handle case where tool name itself has __
    
    return {
      serverAlias,
      toolName
    };
  }

  /**
   * Find a server by its sanitized alias and profile
   * @param serverAlias - The sanitized server name/alias
   * @param profileUuid - The profile UUID
   * @returns Server information or null
   */
  async findServerByAlias(
    serverAlias: string, 
    profileUuid: string
  ): Promise<{ uuid: string; name: string } | null> {
    try {
      const servers = await db
        .select({
          uuid: mcpServersTable.uuid,
          name: mcpServersTable.name
        })
        .from(mcpServersTable)
        .where(and(
          eq(mcpServersTable.profile_uuid, profileUuid),
          eq(mcpServersTable.status, McpServerStatus.ACTIVE)
        ));
      
      // Find server with matching sanitized name
      for (const server of servers) {
        if (this.sanitizeServerName(server.name) === serverAlias) {
          return server;
        }
      }
      
      return null;
    } catch (error) {
      console.error('[ToolAggregator] Error finding server by alias:', error);
      return null;
    }
  }

  /**
   * Check if a tool is allowed based on filters
   * @param toolName - The tool name to check
   * @param serverUuid - The server UUID the tool belongs to
   * @param filters - Filtering options
   * @returns Whether the tool is allowed
   */
  isToolAllowed(
    toolName: string,
    serverUuid?: string,
    filters?: {
      allowedTools?: string[];
      blockedTools?: string[];
      allowedServers?: string[];
      blockedServers?: string[];
    }
  ): boolean {
    if (!filters) return true;
    
    // Check blocked tools first
    if (filters.blockedTools?.includes(toolName)) {
      return false;
    }
    
    // Check blocked servers
    if (serverUuid && filters.blockedServers?.includes(serverUuid)) {
      return false;
    }
    
    // If allowed lists are specified, tool/server must be in them
    if (filters.allowedTools && !filters.allowedTools.includes(toolName)) {
      return false;
    }
    
    if (serverUuid && filters.allowedServers && !filters.allowedServers.includes(serverUuid)) {
      return false;
    }
    
    return true;
  }
}

export const toolAggregator = ToolAggregator.getInstance();