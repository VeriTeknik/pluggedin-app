import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { and, eq, inArray,or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { mcpServersTable,toolsTable } from '@/db/schema';
import { McpServerStatus,ToggleStatus } from '@/db/schema';

/**
 * Tool Registry for managing MCP tools compatible with OpenAI's mcp_list_tools format
 */
export class ToolRegistry {
  private static instance: ToolRegistry;
  private toolCache: Map<string, Tool[]> = new Map();
  private lastCacheUpdate: Map<string, number> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  /**
   * Get all tools for a profile, compatible with OpenAI's mcp_list_tools format
   */
  async getToolsForProfile(profileUuid: string): Promise<Tool[]> {
    const cacheKey = `profile:${profileUuid}`;
    const now = Date.now();
    const lastUpdate = this.lastCacheUpdate.get(cacheKey) || 0;

    // Return cached tools if still valid
    if (now - lastUpdate < this.CACHE_TTL_MS && this.toolCache.has(cacheKey)) {
      return this.toolCache.get(cacheKey)!;
    }

    try {
      // Fetch tools from database
      const dbTools = await db
        .select({
          name: toolsTable.name,
          description: toolsTable.description,
          toolSchema: toolsTable.toolSchema,
          mcpServerUuid: toolsTable.mcp_server_uuid,
          serverName: mcpServersTable.name,
        })
        .from(toolsTable)
        .leftJoin(mcpServersTable, eq(toolsTable.mcp_server_uuid, mcpServersTable.uuid))
        .where(and(
          eq(toolsTable.status, ToggleStatus.ACTIVE),
          eq(mcpServersTable.status, McpServerStatus.ACTIVE),
          eq(mcpServersTable.profile_uuid, profileUuid)
        ));

      // Convert to MCP Tool format compatible with OpenAI
      const tools: Tool[] = dbTools.map(tool => ({
        name: tool.name,
        description: tool.description || `Tool ${tool.name}`,
        inputSchema: tool.toolSchema || { type: 'object', properties: {} },
      }));

      // Cache the results
      this.toolCache.set(cacheKey, tools);
      this.lastCacheUpdate.set(cacheKey, now);

      return tools;
    } catch (error) {
      console.error('Error fetching tools from database:', error);
      // Return empty array on error to avoid breaking the system
      return [];
    }
  }

  /**
   * Get a specific tool by name for a profile
   */
  async getToolByName(profileUuid: string, toolName: string): Promise<Tool | null> {
    const tools = await this.getToolsForProfile(profileUuid);
    return tools.find(tool => tool.name === toolName) || null;
  }

  /**
   * Get tools by server UUID for a profile
   */
  async getToolsByServer(profileUuid: string, serverUuid: string): Promise<Tool[]> {
    try {
      const dbTools = await db
        .select({
          name: toolsTable.name,
          description: toolsTable.description,
          toolSchema: toolsTable.toolSchema,
          mcpServerUuid: toolsTable.mcp_server_uuid,
          serverName: mcpServersTable.name,
        })
        .from(toolsTable)
        .leftJoin(mcpServersTable, eq(toolsTable.mcp_server_uuid, mcpServersTable.uuid))
        .where(and(
          eq(toolsTable.status, ToggleStatus.ACTIVE),
          eq(mcpServersTable.status, McpServerStatus.ACTIVE),
          eq(mcpServersTable.profile_uuid, profileUuid),
          eq(toolsTable.mcp_server_uuid, serverUuid)
        ));

      return dbTools.map(tool => ({
        name: tool.name,
        description: tool.description || `Tool ${tool.name}`,
        inputSchema: tool.toolSchema || { type: 'object', properties: {} },
      }));
    } catch (error) {
      console.error('Error fetching tools by server:', error);
      return [];
    }
  }

  /**
   * Get tool metadata including server information
   */
  async getToolMetadata(profileUuid: string, toolName: string): Promise<{
    tool: Tool;
    serverUuid: string;
    serverName: string;
  } | null> {
    try {
      const dbTools = await db
        .select({
          name: toolsTable.name,
          description: toolsTable.description,
          toolSchema: toolsTable.toolSchema,
          mcpServerUuid: toolsTable.mcp_server_uuid,
          serverName: mcpServersTable.name,
        })
        .from(toolsTable)
        .leftJoin(mcpServersTable, eq(toolsTable.mcp_server_uuid, mcpServersTable.uuid))
        .where(and(
          eq(toolsTable.status, ToggleStatus.ACTIVE),
          eq(mcpServersTable.status, McpServerStatus.ACTIVE),
          eq(mcpServersTable.profile_uuid, profileUuid),
          eq(toolsTable.name, toolName)
        ))
        .limit(1);

      if (dbTools.length === 0) {
        return null;
      }

      const dbTool = dbTools[0];
      return {
        tool: {
          name: dbTool.name,
          description: dbTool.description || `Tool ${dbTool.name}`,
          inputSchema: dbTool.toolSchema || { type: 'object', properties: {} },
        },
        serverUuid: dbTool.mcpServerUuid,
        serverName: dbTool.serverName || 'Unknown Server',
      };
    } catch (error) {
      console.error('Error fetching tool metadata:', error);
      return null;
    }
  }

  /**
   * Invalidate cache for a profile
   */
  invalidateCache(profileUuid: string): void {
    const cacheKey = `profile:${profileUuid}`;
    this.toolCache.delete(cacheKey);
    this.lastCacheUpdate.delete(cacheKey);
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.toolCache.clear();
    this.lastCacheUpdate.clear();
  }

  /**
   * Get tool statistics for a profile
   */
  async getToolStats(profileUuid: string): Promise<{
    totalTools: number;
    servers: Array<{
      uuid: string;
      name: string;
      toolCount: number;
    }>;
  }> {
    try {
      // Get tool count per server
      const serverStats = await db
        .select({
          serverUuid: mcpServersTable.uuid,
          serverName: mcpServersTable.name,
          toolCount: sql<number>`count(${toolsTable.uuid})`.as('toolCount'),
        })
        .from(mcpServersTable)
        .leftJoin(toolsTable, eq(toolsTable.mcp_server_uuid, mcpServersTable.uuid))
        .where(and(
          eq(mcpServersTable.status, McpServerStatus.ACTIVE),
          eq(mcpServersTable.profile_uuid, profileUuid),
          eq(toolsTable.status, ToggleStatus.ACTIVE)
        ))
        .groupBy(mcpServersTable.uuid, mcpServersTable.name);

      const totalTools = serverStats.reduce((sum, stat) => sum + Number(stat.toolCount), 0);

      return {
        totalTools,
        servers: serverStats.map(stat => ({
          uuid: stat.serverUuid,
          name: stat.serverName || 'Unknown Server',
          toolCount: Number(stat.toolCount),
        })),
      };
    } catch (error) {
      console.error('Error fetching tool stats:', error);
      return {
        totalTools: 0,
        servers: [],
      };
    }
  }

  /**
   * Get allowed tools for a profile with filtering
   */
  async getAllowedToolsForProfile(
    profileUuid: string,
    options: {
      allowedTools?: string[];
      blockedTools?: string[];
      allowedServers?: string[];
      blockedServers?: string[];
      searchQuery?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{
    tools: Tool[];
    total: number;
    filtered: number;
    blocked: number;
  }> {
    const {
      allowedTools,
      blockedTools,
      allowedServers,
      blockedServers,
      searchQuery,
      limit = 100,
      offset = 0
    } = options;

    try {
      // Build the base query conditions
      const baseConditions = and(
        eq(toolsTable.status, ToggleStatus.ACTIVE),
        eq(mcpServersTable.status, McpServerStatus.ACTIVE),
        eq(mcpServersTable.profile_uuid, profileUuid)
      );

      // Apply server filters to the query conditions
      let queryConditions = baseConditions;
      
      if (allowedServers && allowedServers.length > 0) {
        queryConditions = and(queryConditions, inArray(mcpServersTable.uuid, allowedServers));
      }
      
      if (blockedServers && blockedServers.length > 0) {
        queryConditions = and(queryConditions, or(
          sql`${mcpServersTable.uuid} NOT IN ${blockedServers}`,
          sql`${mcpServersTable.uuid} IS NULL`
        ));
      }

      // Execute the query
      const query = db
        .select({
          name: toolsTable.name,
          description: toolsTable.description,
          toolSchema: toolsTable.toolSchema,
          mcpServerUuid: toolsTable.mcp_server_uuid,
          serverName: mcpServersTable.name,
        })
        .from(toolsTable)
        .leftJoin(mcpServersTable, eq(toolsTable.mcp_server_uuid, mcpServersTable.uuid))
        .where(queryConditions);

      const totalResult = await query;
      const total = totalResult.length;

      // Apply tool filters in memory
      let filteredTools = totalResult;

      if (allowedTools && allowedTools.length > 0) {
        filteredTools = filteredTools.filter(tool =>
          allowedTools.includes(tool.name)
        );
      }

      if (blockedTools && blockedTools.length > 0) {
        filteredTools = filteredTools.filter(tool =>
          !blockedTools.includes(tool.name)
        );
      }

      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        filteredTools = filteredTools.filter(tool =>
          tool.name.toLowerCase().includes(searchLower) ||
          (tool.description && tool.description.toLowerCase().includes(searchLower)) ||
          (tool.serverName && tool.serverName.toLowerCase().includes(searchLower))
        );
      }

      // Apply pagination
      const blocked = total - filteredTools.length;
      const paginatedTools = filteredTools.slice(offset, offset + limit);

      // Convert to MCP Tool format
      const tools: Tool[] = paginatedTools.map(tool => ({
        name: tool.name,
        description: tool.description || `Tool ${tool.name}`,
        inputSchema: tool.toolSchema || { type: 'object', properties: {} },
      }));

      return {
        tools,
        total,
        filtered: filteredTools.length,
        blocked
      };
    } catch (error) {
      console.error('Error fetching allowed tools:', error);
      return {
        tools: [],
        total: 0,
        filtered: 0,
        blocked: 0
      };
    }
  }

  /**
   * Check if a tool is allowed for a profile
   */
  async isToolAllowed(
    profileUuid: string,
    toolName: string,
    options: {
      allowedTools?: string[];
      blockedTools?: string[];
      allowedServers?: string[];
      blockedServers?: string[];
    } = {}
  ): Promise<{
    allowed: boolean;
    reason?: string;
    tool?: Tool;
  }> {
    const {
      allowedTools,
      blockedTools,
      allowedServers,
      blockedServers
    } = options;

    try {
      // First, get the tool metadata
      const toolMetadata = await this.getToolMetadata(profileUuid, toolName);
      
      if (!toolMetadata) {
        return {
          allowed: false,
          reason: 'Tool not found'
        };
      }

      // Check if tool is explicitly blocked
      if (blockedTools && blockedTools.includes(toolName)) {
        return {
          allowed: false,
          reason: 'Tool is blocked',
          tool: toolMetadata.tool
        };
      }

      // Check if server is blocked
      if (blockedServers && blockedServers.includes(toolMetadata.serverUuid)) {
        return {
          allowed: false,
          reason: 'Tool server is blocked',
          tool: toolMetadata.tool
        };
      }

      // Check if allowed tools list exists and tool is not in it
      if (allowedTools && allowedTools.length > 0 && !allowedTools.includes(toolName)) {
        return {
          allowed: false,
          reason: 'Tool not in allowed list',
          tool: toolMetadata.tool
        };
      }

      // Check if allowed servers list exists and server is not in it
      if (allowedServers && allowedServers.length > 0 && !allowedServers.includes(toolMetadata.serverUuid)) {
        return {
          allowed: false,
          reason: 'Tool server not in allowed list',
          tool: toolMetadata.tool
        };
      }

      // If all checks pass, tool is allowed
      return {
        allowed: true,
        tool: toolMetadata.tool
      };
    } catch (error) {
      console.error('Error checking tool permission:', error);
      return {
        allowed: false,
        reason: 'Internal error checking tool permission'
      };
    }
  }

  /**
   * Get tool categories for a profile
   */
  async getToolCategories(profileUuid: string): Promise<{
    categories: Array<{
      name: string;
      toolCount: number;
      servers: Array<{
        uuid: string;
        name: string;
        toolCount: number;
      }>;
    }>;
  }> {
    try {
      // Get all tools with server information
      const tools = await db
        .select({
          name: toolsTable.name,
          serverUuid: mcpServersTable.uuid,
          serverName: mcpServersTable.name,
        })
        .from(toolsTable)
        .leftJoin(mcpServersTable, eq(toolsTable.mcp_server_uuid, mcpServersTable.uuid))
        .where(and(
          eq(toolsTable.status, ToggleStatus.ACTIVE),
          eq(mcpServersTable.status, McpServerStatus.ACTIVE),
          eq(mcpServersTable.profile_uuid, profileUuid)
        ));

      // Group by server (category)
      const serverMap = new Map<string, {
        uuid: string;
        name: string;
        tools: string[];
      }>();

      tools.forEach(tool => {
        if (tool.serverUuid && tool.serverName) {
          if (!serverMap.has(tool.serverUuid)) {
            serverMap.set(tool.serverUuid, {
              uuid: tool.serverUuid,
              name: tool.serverName,
              tools: []
            });
          }
          serverMap.get(tool.serverUuid)!.tools.push(tool.name);
        }
      });

      // Convert to categories format
      const categories = Array.from(serverMap.entries()).map(([serverUuid, server]) => ({
        name: server.name,
        toolCount: server.tools.length,
        servers: [{
          uuid: server.uuid,
          name: server.name,
          toolCount: server.tools.length
        }]
      }));

      return { categories };
    } catch (error) {
      console.error('Error fetching tool categories:', error);
      return { categories: [] };
    }
  }

  /**
   * Validate tool filter configuration
   */
  validateToolFilterConfig(config: {
    allowedTools?: string[];
    blockedTools?: string[];
    allowedServers?: string[];
    blockedServers?: string[];
  }): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check for overlapping allowed and blocked tools
    if (config.allowedTools && config.blockedTools) {
      const overlap = config.allowedTools.filter(tool => config.blockedTools!.includes(tool));
      if (overlap.length > 0) {
        errors.push(`Tools cannot be both allowed and blocked: ${overlap.join(', ')}`);
      }
    }

    // Check for overlapping allowed and blocked servers
    if (config.allowedServers && config.blockedServers) {
      const overlap = config.allowedServers.filter(server => config.blockedServers!.includes(server));
      if (overlap.length > 0) {
        errors.push(`Servers cannot be both allowed and blocked: ${overlap.join(', ')}`);
      }
    }

    // Validate tool name formats
    const toolNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    const allTools = [...(config.allowedTools || []), ...(config.blockedTools || [])];
    const invalidToolNames = allTools.filter(tool => !toolNameRegex.test(tool));
    if (invalidToolNames.length > 0) {
      errors.push(`Invalid tool name format: ${invalidToolNames.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get tool usage statistics for a profile
   */
  async getToolUsageStats(profileUuid: string): Promise<{
    totalCalls: number;
    toolStats: Array<{
      name: string;
      calls: number;
      lastUsed: Date | null;
      successRate: number;
    }>;
    serverStats: Array<{
      uuid: string;
      name: string;
      calls: number;
      successRate: number;
    }>;
  }> {
    try {
      // This is a placeholder implementation
      // In a real system, you would query a usage statistics table
      // For now, we'll return empty statistics
      
      return {
        totalCalls: 0,
        toolStats: [],
        serverStats: []
      };
    } catch (error) {
      console.error('Error fetching tool usage stats:', error);
      return {
        totalCalls: 0,
        toolStats: [],
        serverStats: []
      };
    }
  }

  /**
   * Schema for tool filter configuration
   */
  static get ToolFilterSchema() {
    return z.object({
      allowedTools: z.array(z.string()).optional(),
      blockedTools: z.array(z.string()).optional(),
      allowedServers: z.array(z.string()).optional(),
      blockedServers: z.array(z.string()).optional(),
    });
  }

  /**
   * Schema for tool listing options
   */
  static get ToolListOptionsSchema() {
    return z.object({
      allowedTools: z.array(z.string()).optional(),
      blockedTools: z.array(z.string()).optional(),
      allowedServers: z.array(z.string()).optional(),
      blockedServers: z.array(z.string()).optional(),
      searchQuery: z.string().optional(),
      limit: z.number().min(1).max(1000).default(100),
      offset: z.number().min(0).default(0),
    });
  }
}