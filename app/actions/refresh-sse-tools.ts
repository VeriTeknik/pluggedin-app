import { db } from '@/db';
import { eq } from 'drizzle-orm';
import { mcpServersTable, toolsTable, McpServerStatus, ToolStatus } from '@/db/schema';

export async function refreshSseTools(serverUuid: string) {
  try {
    const server = await db
      .select()
      .from(mcpServersTable)
      .where(eq(mcpServersTable.uuid, serverUuid))
      .limit(1);

    if (!server[0]) {
      throw new Error('Server not found');
    }

    if (!server[0].url) {
      throw new Error('Server URL not found');
    }

    // Fetch tools from SSE server
    const response = await fetch(server[0].url);
    if (!response.ok) {
      throw new Error('Failed to fetch tools from SSE server');
    }

    const tools = await response.json();

    // Update tools in database
    await db.transaction(async (tx) => {
      // First, mark all existing tools as inactive
      await tx
        .update(toolsTable)
        .set({ status: ToolStatus.INACTIVE })
        .where(eq(toolsTable.mcp_server_uuid, serverUuid));

      // Then, update or insert new tools
      if (tools && Array.isArray(tools)) {
        for (const tool of tools) {
          await tx
            .insert(toolsTable)
            .values({
              ...tool,
              mcp_server_uuid: serverUuid,
              status: ToolStatus.ACTIVE,
            })
            .onConflictDoUpdate({
              target: [toolsTable.mcp_server_uuid, toolsTable.name],
              set: {
                description: tool.description,
                toolSchema: tool.toolSchema,
                status: ToolStatus.ACTIVE,
              },
            });
        }
      }
    });
  } catch (error) {
    console.error('Error refreshing SSE tools:', error);
    throw error;
  }
}
