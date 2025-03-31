import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db'; // Assuming db is correctly exported from '@/db'
import { mcpServersTable, toolsTable } from '@/db/schema'; // Assuming schema is correctly exported

// Adjust the path based on your actual auth file location
import { authenticateApiKey } from '../../auth';

export async function GET(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;

    // Get all tools associated with the user's active profile
    const allTools = await db
      .select({
        tool_uuid: toolsTable.uuid,
        tool_name: toolsTable.name,
        tool_status: toolsTable.status,
        tool_description: toolsTable.description, // Include description
        tool_schema: toolsTable.toolSchema, // Include schema
        server_uuid: mcpServersTable.uuid,
        server_name: mcpServersTable.name,
        created_at: toolsTable.created_at, // Include created_at
      })
      .from(toolsTable)
      .innerJoin(
        mcpServersTable,
        eq(toolsTable.mcp_server_uuid, mcpServersTable.uuid)
      )
      .where(eq(mcpServersTable.profile_uuid, auth.activeProfile.uuid)) // Filter by active profile
      .orderBy(mcpServersTable.name, toolsTable.name); // Order for consistency

    // Group tools by server UUID for the summary count
    const toolsByServerUuid = allTools.reduce((acc, tool) => {
      const serverUuid = tool.server_uuid;
      if (!acc[serverUuid]) {
        acc[serverUuid] = [];
      }
      acc[serverUuid].push(tool);
      return acc;
    }, {} as Record<string, typeof allTools>);

    // Count tools by server UUID
    const toolCounts = Object.entries(toolsByServerUuid).map(
      ([serverUuid, tools]) => ({
        server_uuid: serverUuid,
        // Get server name from the first tool in the group (they all belong to the same server)
        server_name: tools[0]?.server_name || 'Unknown Server',
        tool_count: tools.length,
      })
    );

    return NextResponse.json({
      total_tools: allTools.length,
      tools_by_server: toolCounts,
      all_tools_details: allTools, // Return the detailed list as well
    });
  } catch (error: any) {
    console.error('Error fetching debug tool information:', error);
    return NextResponse.json(
      {
        error: 'Internal server error fetching debug tool information',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
