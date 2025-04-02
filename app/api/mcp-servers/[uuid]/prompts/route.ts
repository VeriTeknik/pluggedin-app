import { and, asc,eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { mcpServersTable, profilesTable, projectsTable, promptsTable } from '@/db/schema'; // Import promptsTable
import { getAuthSession } from '@/lib/auth'; // Internal imports first

export const dynamic = 'force-dynamic';

/**
 * GET /api/mcp-servers/{uuid}/prompts
 *
 * Retrieves a list of discovered prompts for a specific MCP server,
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

    // 3. Query the prompts table for the specific server UUID
    const prompts = await db
      .select() // Select all columns from promptsTable
      .from(promptsTable)
      .where(eq(promptsTable.mcp_server_uuid, serverUuid))
      .orderBy(asc(promptsTable.name)); // Optional ordering

    // 4. Return the list of prompts
    return NextResponse.json(prompts);

  } catch (error) {
    console.error(`[API /api/mcp-servers/${params.uuid}/prompts Error]`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal Server Error fetching server prompts', details: errorMessage }, { status: 500 });
  }
}
