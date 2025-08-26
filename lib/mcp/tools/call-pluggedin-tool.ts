import { ToolExecutionResult } from "../types";

/**
 * Call a pluggedin tool by name
 * This function handles the actual execution of tools from the database
 */
export async function callPluggedinTool(
  toolName: string,
  toolArgs: any
): Promise<ToolExecutionResult> {
  try {
    // Import here to avoid circular dependencies
    const { db } = await import('@/db');
    const { toolsTable, mcpServersTable } = await import('@/db/schema');
    const { eq, and } = await import('drizzle-orm');
    const { ToggleStatus, McpServerStatus } = await import('@/db/schema');

    // Find the tool in the database
    const toolRecord = await db
      .select({
        name: toolsTable.name,
        description: toolsTable.description,
        inputSchema: toolsTable.toolSchema,
        mcpServerUuid: toolsTable.mcp_server_uuid,
        serverName: mcpServersTable.name,
        serverCommand: mcpServersTable.command,
        serverArgs: mcpServersTable.args,
        serverEnv: mcpServersTable.env,
      })
      .from(toolsTable)
      .leftJoin(mcpServersTable, eq(toolsTable.mcp_server_uuid, mcpServersTable.uuid))
      .where(and(
        eq(toolsTable.name, toolName),
        eq(toolsTable.status, ToggleStatus.ACTIVE),
        eq(mcpServersTable.status, McpServerStatus.ACTIVE)
      ))
      .limit(1);

    if (!toolRecord || toolRecord.length === 0) {
      return {
        isError: true,
        content: [{ type: "text", text: `Tool not found: ${toolName}` }],
      };
    }

    const tool = toolRecord[0];
    
    if (!tool.mcpServerUuid || !tool.serverCommand) {
      return {
        isError: true,
        content: [{ type: "text", text: `Tool server configuration incomplete: ${toolName}` }],
      };
    }

    // For now, return a placeholder response
    // In a full implementation, this would:
    // 1. Connect to the MCP server
    // 2. Call the tool with the provided arguments
    // 3. Return the result
    
    return {
      content: [
        {
          type: "text",
          text: `Tool ${toolName} executed successfully. Server: ${tool.serverName || tool.mcpServerUuid}. Arguments: ${JSON.stringify(toolArgs, null, 2)}`,
        },
      ],
    };

  } catch (error) {
    console.error(`Error calling tool ${toolName}:`, error);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error executing tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

/**
 * Get a list of available pluggedin tools
 * This function fetches tools from the database and formats them for MCP
 */
export async function getPluggedinTools(): Promise<any> {
  try {
    // Import here to avoid circular dependencies
    const { db } = await import('@/db');
    const { toolsTable, mcpServersTable } = await import('@/db/schema');
    const { eq, and } = await import('drizzle-orm');
    const { ToggleStatus, McpServerStatus } = await import('@/db/schema');

    // Fetch tools from database
    const dbTools = await db
      .select({
        name: toolsTable.name,
        description: toolsTable.description,
        inputSchema: toolsTable.toolSchema,
        mcpServerUuid: toolsTable.mcp_server_uuid,
        serverName: mcpServersTable.name,
      })
      .from(toolsTable)
      .leftJoin(mcpServersTable, eq(toolsTable.mcp_server_uuid, mcpServersTable.uuid))
      .where(and(
        eq(toolsTable.status, ToggleStatus.ACTIVE),
        eq(mcpServersTable.status, McpServerStatus.ACTIVE)
      ));

    // Convert to a flattened object format similar to pluggedin-mcp
    const flattenedTools: Record<string, any> = {};

    dbTools.forEach(tool => {
      flattenedTools[tool.name] = {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description || `Tool ${tool.name}`,
          parameters: tool.inputSchema || { type: "object", properties: {} },
          _serverUuid: tool.mcpServerUuid,
          _serverName: tool.serverName,
        }
      };
    });

    return flattenedTools;

  } catch (error) {
    console.error('Error fetching pluggedin tools:', error);
    return {};
  }
}