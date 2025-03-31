// app/api/tools/[serverUuid]/[toolName]/route.ts
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { authenticateApiKey } from '@/app/api/auth'; // Using path alias relative to app root
import { db } from '@/db'; // Using path alias
import { mcpServersTable, toolsTable } from '@/db/schema'; // Using path alias

export async function GET(
  request: Request,
  { params }: { params: { serverUuid: string; toolName: string } }
) {
  try {
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;

    // Ensure activeProfile is available after authentication
    if (!auth.activeProfile) {
       return NextResponse.json(
        { error: 'Active profile not found after authentication' },
        { status: 401 } // Unauthorized or Bad Request might be appropriate
      );
    }

    const { serverUuid, toolName } = params;

    // Fetch the specific tool associated with the authenticated user's active profile
    const tool = await db
      .select({
        uuid: toolsTable.uuid,
        name: toolsTable.name,
        description: toolsTable.description,
        toolSchema: toolsTable.toolSchema, // Changed from inputSchema based on schema.ts
        status: toolsTable.status,
        mcp_server_uuid: toolsTable.mcp_server_uuid,
      })
      .from(toolsTable)
      .innerJoin(
        mcpServersTable,
        eq(toolsTable.mcp_server_uuid, mcpServersTable.uuid)
      )
      .where(
        and(
          eq(toolsTable.mcp_server_uuid, serverUuid),
          eq(toolsTable.name, toolName),
          eq(mcpServersTable.profile_uuid, auth.activeProfile.uuid) // Ensure tool belongs to the user's profile
         )
      )
      // Define a basic type for the result array elements
      .then((results: Array<{ uuid: string | null; name: string | null; description: string | null; toolSchema: any; status: string | null; mcp_server_uuid: string | null }>) => results[0] || null);

    if (!tool) {
      return NextResponse.json(
        { error: 'Tool not found or not associated with this profile' },
        { status: 404 }
      );
    }

    return NextResponse.json({ tool });
  } catch (error) {
    console.error('Error fetching specific tool:', error);
    // Avoid leaking internal details in production
    return NextResponse.json(
      // Provide a generic error message to the client
      { error: 'Internal server error while fetching tool' }, 
      { status: 500 }
    );
  }
}
