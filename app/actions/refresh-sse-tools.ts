import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm'; // Import sql for excluded

import { db } from '@/db';
// Re-import toolsTable and use ToggleStatus
import { mcpServersTable, ToggleStatus,toolsTable } from '@/db/schema';

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

    const tools = await response.json(); // Keep fetching, maybe log it?

    console.log(`Fetched tools for SSE server ${serverUuid}:`, tools); // Log fetched tools

    // Uncomment and update database logic
    await db.transaction(async (tx) => {
      // First, mark all existing tools for this server as inactive
      await tx
        .update(toolsTable)
        .set({ status: ToggleStatus.INACTIVE }) // Use ToggleStatus
        .where(eq(toolsTable.mcp_server_uuid, serverUuid));

      // Then, update or insert new tools, setting them as active
      if (tools && Array.isArray(tools)) {
        const toolsToUpsert = tools.map((tool: any) => ({ // Assume tool structure from fetch
          name: tool.name,
          description: tool.description,
          toolSchema: tool.inputSchema || tool.toolSchema, // Handle potential naming difference
          mcp_server_uuid: serverUuid,
          status: ToggleStatus.ACTIVE, // Set as ACTIVE
        }));

        if (toolsToUpsert.length > 0) {
           await tx
            .insert(toolsTable)
            .values(toolsToUpsert)
            .onConflictDoUpdate({
              target: [toolsTable.mcp_server_uuid, toolsTable.name],
              set: {
                description: sql`excluded.description`,
                toolSchema: sql`excluded.tool_schema`,
                status: ToggleStatus.ACTIVE, // Ensure status is updated to ACTIVE
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
