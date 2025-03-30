import { and,eq, sql } from 'drizzle-orm'; // Import necessary drizzle functions
import { NextResponse } from 'next/server';

import { db } from '@/db';
// Import the correct table and enum names from your schema
import { mcpServersTable, ToggleStatus,toolsTable } from '@/db/schema';

import { authenticateApiKey } from '../auth'; // Assuming this path is correct

// GET handler to fetch tools with optional status filter
export async function GET(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // e.g., 'ACTIVE' or 'INACTIVE'

    // Base conditions: filter by the authenticated user's active profile
    const conditions = [eq(mcpServersTable.profile_uuid, auth.activeProfile.uuid)];

    // Add status filter if provided and valid
    if (status && Object.values(ToggleStatus).includes(status as ToggleStatus)) {
      conditions.push(eq(toolsTable.status, status as ToggleStatus));
    }

    // Perform the query joining tools and servers tables
    const results = await db
      .select({
        mcp_server_uuid: toolsTable.mcp_server_uuid,
        name: toolsTable.name,
        status: toolsTable.status,
        // Add other tool fields if needed
        // description: toolsTable.description,
        // toolSchema: toolsTable.toolSchema,
        // uuid: toolsTable.uuid,
      })
      .from(toolsTable)
      .innerJoin(
        mcpServersTable,
        eq(toolsTable.mcp_server_uuid, mcpServersTable.uuid) // Correct join condition
      )
      .where(and(...conditions)); // Use and() helper

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Error fetching tools:", error);
    return NextResponse.json(
      { error: "Internal server error while fetching tools" },
      { status: 500 }
    );
  }
}


// POST handler to report/update tools from pluggedin-mcp
export async function POST(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const { tools } = body;

    // Validate that tools is an array
    if (!Array.isArray(tools) || tools.length === 0) {
      return NextResponse.json(
        { error: 'Request must include a non-empty array of tools' },
        { status: 400 }
      );
    }

    // Fetch valid server UUIDs for the current profile to ensure ownership
    const userServers = await db.select({ uuid: mcpServersTable.uuid })
      .from(mcpServersTable)
      .where(eq(mcpServersTable.profile_uuid, auth.activeProfile.uuid));
    const validServerUuids = new Set(userServers.map(s => s.uuid));


    // Validate required fields for all tools and prepare for batch insertion
    const validTools = [];
    const errors = [];

    for (const tool of tools) {
      // Ensure tool is treated as 'any' temporarily if its type isn't strictly defined yet
      const currentTool: any = tool;
      const { name, description, toolSchema, mcp_server_uuid } = currentTool;

      // Validate required fields for each tool
      if (!name || !toolSchema || !mcp_server_uuid) {
        errors.push({
          tool: currentTool,
          error:
            'Missing required fields: name, toolSchema, or mcp_server_uuid',
        });
        continue;
      }

      // --- Security Validation ---
      // Check if the provided mcp_server_uuid belongs to the authenticated profile
      if (!validServerUuids.has(mcp_server_uuid)) {
         errors.push({
           tool: currentTool,
           error: `Invalid mcp_server_uuid: ${mcp_server_uuid}. Server does not belong to the active profile.`,
         });
         continue; // Skip this tool
      }
      // --- End Security Validation ---


      validTools.push({
        name,
        description,
        toolSchema, // Ensure this matches the jsonb structure expected by the DB
        mcp_server_uuid,
        status: ToggleStatus.ACTIVE, // Default to ACTIVE on report
      });
    }

    // Batch insert all valid tools with upsert
    let results: any[] = [];
    if (validTools.length > 0) {
      try {
        // Note: Drizzle requires explicit type for jsonb, ensure toolSchema matches
        const toolsToInsert = validTools.map(vt => ({
          ...vt,
          toolSchema: vt.toolSchema as any // Cast if necessary, ensure structure is correct
        }));

        results = await db
          .insert(toolsTable)
          .values(toolsToInsert)
          .onConflictDoUpdate({
            target: [toolsTable.mcp_server_uuid, toolsTable.name], // Unique constraint
            set: {
              description: sql`excluded.description`,
              toolSchema: sql`excluded.tool_schema`,
              // Potentially update status here if needed, e.g., set to ACTIVE on report
              // status: ToggleStatus.ACTIVE
            },
          })
          .returning(); // Return the inserted/updated rows
      } catch (error: any) {
        // Handle database errors for the batch operation
        console.error('Database error during tool upsert:', error);
        return NextResponse.json(
          {
            error: 'Failed to process tools request',
            details:
              error.code === '23503' // Foreign key violation
                ? 'One or more MCP server UUIDs not found.'
                : 'Database error occurred during upsert.',
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      results,
      errors, // Report validation errors back
      success: results.length > 0 && errors.length === 0, // Success only if all validated tools were processed
      failureCount: errors.length,
      successCount: results.length,
    });
  } catch (error) {
    console.error("Error processing POST /api/tools:", error);
    return NextResponse.json(
      { error: "Internal server error processing tools" },
      { status: 500 }
    );
  }
}
