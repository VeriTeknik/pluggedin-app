import { and, eq } from 'drizzle-orm'; // Then external
import { NextResponse } from 'next/server'; // External first

import { db } from '@/db';
import { customInstructionsTable, mcpServersTable, profilesTable, projectsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth'; // Then internal

export const dynamic = 'force-dynamic';

/**
 * GET /api/mcp-servers/{uuid}/custom-instructions
 *
 * Retrieves the custom instructions for a specific MCP server,
 * ensuring the server belongs to the authenticated user.
 */
export async function GET(
  request: Request,
  { params }: { params: { uuid: string } } // Route parameter for server UUID
) {
  try {
    // 1. Authenticate user session
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
    }
    const userId = session.user.id;

    const serverUuid = params.uuid;
    if (!serverUuid) {
      return NextResponse.json({ error: 'Missing server UUID parameter' }, { status: 400 });
    }

    // 2. Verify the server belongs to the authenticated user
    const serverCheck = await db
        .select({ serverId: mcpServersTable.uuid })
        .from(mcpServersTable)
        .innerJoin(profilesTable, eq(mcpServersTable.profile_uuid, profilesTable.uuid))
        .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
        .where(and(
            eq(mcpServersTable.uuid, serverUuid),
            eq(projectsTable.user_id, userId) // Check ownership via project
        ))
        .limit(1);

    if (serverCheck.length === 0) {
        return NextResponse.json({ error: 'Server not found or user does not have access.' }, { status: 404 });
    }

    // 3. Query the custom instructions table for the specific server UUID
    const instructions = await db
      .select() // Select all columns from customInstructionsTable
      .from(customInstructionsTable)
      .where(eq(customInstructionsTable.mcp_server_uuid, serverUuid))
      .limit(1); // Expecting only one record per server due to unique constraint

    // 4. Return the instructions record (or null/empty object if none found)
    // The findFirst method in the action might be better, but this works too
    if (instructions.length === 0) {
        // Return a default structure or null if no instructions are set
        return NextResponse.json(null); // Or return an empty object {} or default structure
    }
    return NextResponse.json(instructions[0]);

  } catch (error) {
    console.error(`[API /api/mcp-servers/${params.uuid}/custom-instructions Error]`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal Server Error fetching custom instructions', details: errorMessage }, { status: 500 });
  }
}

// POST/PUT handler could be added here later for saving via API if needed,
// but currently using server actions (upsertCustomInstructions).
