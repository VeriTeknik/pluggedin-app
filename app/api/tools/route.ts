import { and, eq, type InferSelectModel,sql } from 'drizzle-orm'; // Consolidated drizzle imports
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { mcpServersTable, McpServerStatus, ToggleStatus, toolsTable } from '@/db/schema';

import { authenticateApiKey } from '../auth';
// Removed direct SDK type import

// Infer Tool type from DB schema and define expected MCP Tool structure
type DbTool = InferSelectModel<typeof toolsTable> & { serverName: string | null }; // Add serverName from join
type McpTool = {
  name: string;
  description?: string;
  inputSchema: any; // Keep as any for now, assuming DB stores valid JSON schema
  // Add other fields from MCP spec if needed, e.g., annotations
};


/**
 * Simple sanitization for creating a server name prefix.
 */
function sanitizeServerNameForPrefix(name: string | null | undefined): string {
  if (!name) return 'unknown_server'; // Fallback prefix
  // Basic sanitization: lowercase, replace non-alphanumeric with underscore, trim underscores
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}


/**
 * Validates the provided tool status string against the ToggleStatus enum.
 * Defaults to ACTIVE if the status is missing or invalid.
 * @param status - The status string to validate (optional).
 * @returns The validated ToggleStatus enum value.
 */
function validateToolStatus(status: string | undefined): ToggleStatus {
  // Check if status is provided and is a valid enum value
  if (status && Object.values(ToggleStatus).includes(status as ToggleStatus)) {
    return status as ToggleStatus;
  }
  // Default to ACTIVE if status is missing or invalid
  return ToggleStatus.ACTIVE;
}

/**
 * @swagger
 * /api/tools:
 *   get:
 *     summary: Get tools for the active profile
 *     description: Retrieves a list of tools associated with the authenticated user's active profile. Filters by tool status (defaulting to ACTIVE) and ensures the parent MCP server is also ACTIVE. Requires API key authentication.
 *     tags:
 *       - Tools
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE]
 *         required: false
 *         description: Filter tools by status (defaults to ACTIVE if not provided).
 *     responses:
 *       200:
 *         description: Successfully retrieved tools.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       mcp_server_uuid:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       status:
 *                         $ref: '#/components/schemas/ToggleStatus' # Assuming ToggleStatus is defined elsewhere or needs definition
 *       401:
 *         description: Unauthorized - Invalid or missing API key.
 *       500:
 *         description: Internal Server Error.
 */
export async function GET(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // e.g., 'ACTIVE' or 'INACTIVE'

    // Base conditions: filter by the authenticated user's active profile AND ensure parent server is ACTIVE
    const conditions = [
      eq(mcpServersTable.profile_uuid, auth.activeProfile.uuid),
      eq(mcpServersTable.status, McpServerStatus.ACTIVE) // Filter by parent server status
    ];

    // Add tool status filter if provided and valid
    if (status && Object.values(ToggleStatus).includes(status as ToggleStatus)) {
      conditions.push(eq(toolsTable.status, status as ToggleStatus));
    } else {
      // Default to fetching only ACTIVE tools if no specific status is requested
      conditions.push(eq(toolsTable.status, ToggleStatus.ACTIVE));
    }

    // Perform the query joining tools and servers tables
    const results: DbTool[] = await db // Add DbTool type annotation
      .select({
        // Select ALL columns from toolsTable to match DbTool type
        uuid: toolsTable.uuid,
        name: toolsTable.name,
        description: toolsTable.description,
        toolSchema: toolsTable.toolSchema,
        created_at: toolsTable.created_at,
        mcp_server_uuid: toolsTable.mcp_server_uuid,
        status: toolsTable.status,
        // Select server name for prefix
        serverName: mcpServersTable.name,
      })
      .from(toolsTable)
      .innerJoin(
        mcpServersTable,
        eq(toolsTable.mcp_server_uuid, mcpServersTable.uuid) // Correct join condition
      )
      .where(and(...conditions));

    // Map results to include prefixed names and _serverUuid
    const formattedTools: (McpTool & { _serverUuid: string })[] = results.map((tool: DbTool) => { // Use DbTool type
        const prefix = sanitizeServerNameForPrefix(tool.serverName);
        const prefixedName = `${prefix}_${tool.name}`;
        return {
            name: prefixedName,
            description: tool.description ?? undefined,
            inputSchema: tool.toolSchema as any, // Assuming toolSchema is the correct JSON schema structure
            _serverUuid: tool.mcp_server_uuid, // Add the original server UUID
        };
    });

    // Return the flat array of tools, as expected by the proxy's list handler
    return NextResponse.json(formattedTools);

  } catch (error) {
    console.error("Error fetching tools:", error);
    return NextResponse.json(
      { error: "Internal server error while fetching tools" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/tools:
 *   post:
 *     summary: Report/Update tools from MCP Proxy
 *     description: Allows the pluggedin-mcp proxy server (or other authorized clients) to report discovered tools for a specific MCP server belonging to the authenticated user's profile. Performs an upsert operation based on mcp_server_uuid and tool name. Requires API key authentication.
 *     tags:
 *       - Tools
 *     security:
 *       - apiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tools
 *             properties:
 *               tools:
 *                 type: array
 *                 description: An array of tool objects to report/update.
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                     - toolSchema
 *                     - mcp_server_uuid
 *                   properties:
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                       nullable: true
 *                     toolSchema:
 *                       type: object # Represents JSONB
 *                       description: The JSON schema definition for the tool's input.
 *                     mcp_server_uuid:
 *                       type: string
 *                       format: uuid
 *                     status:
 *                       $ref: '#/components/schemas/ToggleStatus' # Assuming ToggleStatus is defined
 *                       description: Optional status (defaults to ACTIVE if not provided).
 *     responses:
 *       200:
 *         description: Tools processed successfully. May include validation errors for specific tools.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   description: Array of successfully inserted/updated tool records (structure depends on DB return).
 *                 errors:
 *                   type: array
 *                   description: Array of validation errors encountered for specific tools.
 *                   items:
 *                     type: object
 *                     properties:
 *                       tool:
 *                         type: object # The tool data that failed validation
 *                       error:
 *                         type: string # The validation error message
 *                 success:
 *                   type: boolean
 *                   description: True if at least one tool was successfully processed and no validation errors occurred.
 *                 failureCount:
 *                   type: integer
 *                   description: Number of tools that failed validation.
 *                 successCount:
 *                   type: integer
 *                   description: Number of tools successfully inserted/updated.
 *       400:
 *         description: Bad Request - Invalid request body (e.g., missing 'tools' array).
 *       401:
 *         description: Unauthorized - Invalid or missing API key.
 *       500:
 *         description: Internal Server Error - Database error or other server-side issue.
 */
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
        // Use the validation function, passing the status from the incoming tool data
        status: validateToolStatus(currentTool.status),
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
