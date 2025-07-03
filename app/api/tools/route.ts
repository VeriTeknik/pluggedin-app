import { and, eq, type InferSelectModel, sql } from 'drizzle-orm'; // Removed unused isNull, kept sql
import { NextResponse } from 'next/server';

import { discoverSingleServerTools } from '@/app/actions/discover-mcp-tools'; // Moved up
import { authenticateApiKey } from '@/app/api/auth'; // Moved up
import { db } from '@/db';
import { mcpServersTable, McpServerStatus, ToggleStatus, toolsTable } from '@/db/schema';


// Infer Tool type from DB schema and define expected MCP Tool structure
type DbTool = InferSelectModel<typeof toolsTable> & { serverName: string | null }; // Add serverName from join
type McpTool = {
  name: string;
  description?: string;
  inputSchema: any; // Keep as any for now, assuming DB stores valid JSON schema
  _serverName?: string; // Add server name for proxy routing
  // Add other fields from MCP spec if needed, e.g., annotations
};


/**
 * Simple sanitization for creating a server name prefix.
 * Modified to preserve original tool names by using a delimiter that doesn't break MCP calls.
 */
function sanitizeServerNameForPrefix(name: string | null | undefined): string {
  if (!name) return 'unknown-server'; // Fallback prefix - using hyphen instead of underscore
  // Use hyphens instead of underscores as delimiters to avoid breaking MCP tool names
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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

// In-memory cache to track recent discovery attempts
const discoveryAttempts = new Map<string, number>();
const DISCOVERY_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

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
    // 1. Authenticate API Key and get active profile
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;
    const profileUuid = auth.activeProfile.uuid;

    let discoveryTriggered = false;
    const serversBeingDiscovered: string[] = [];

    // 2. Fetch ACTIVE MCP servers for the profile with tool counts
    const activeServers = await db
      .select({
        uuid: mcpServersTable.uuid,
        name: mcpServersTable.name,
        toolCount: sql<number>`count(${toolsTable.uuid})`.as('toolCount'),
      })
      .from(mcpServersTable)
      .leftJoin(toolsTable, eq(toolsTable.mcp_server_uuid, mcpServersTable.uuid))
      .where(and(
        eq(mcpServersTable.profile_uuid, profileUuid),
        eq(mcpServersTable.status, McpServerStatus.ACTIVE)
      ))
      .groupBy(mcpServersTable.uuid, mcpServersTable.name);

    // 3. Check each active server for discovery needs with throttling
    const discoveryPromises = activeServers.map(async (server) => {
      try {
        const toolCount = server.toolCount || 0;
        const serverKey = `${profileUuid}:${server.uuid}`;
        const lastAttempt = discoveryAttempts.get(serverKey) || 0;
        const now = Date.now();
        
        // Only trigger discovery if:
        // 1. Server has no tools AND
        // 2. No recent discovery attempt (within throttle period)
        const shouldDiscover = toolCount === 0 && (now - lastAttempt) > DISCOVERY_THROTTLE_MS;

        if (shouldDiscover) {
          console.log(`[API /api/tools] Triggering discovery for server ${server.name || 'Unnamed'} (${server.uuid}). Tool count: ${toolCount}`);
          discoveryTriggered = true;
          serversBeingDiscovered.push(server.name || server.uuid);

          // Record discovery attempt to prevent duplicates
          discoveryAttempts.set(serverKey, now);

          // Trigger discovery asynchronously (fire-and-forget)
          discoverSingleServerTools(profileUuid, server.uuid).catch(err => {
            console.error(`[API /api/tools] Background discovery failed for ${server.uuid}:`, err);
            // Remove from cache on failure to allow retry sooner
            discoveryAttempts.delete(serverKey);
          });
        }
      } catch (checkError) {
        console.error(`[API /api/tools] Error checking tools for server ${server.uuid}:`, checkError);
      }
    });

    // Wait for all checks to complete
    await Promise.allSettled(discoveryPromises);

    // Clean up old entries from discovery attempts cache
    const cutoff = Date.now() - DISCOVERY_THROTTLE_MS;
    for (const [key, timestamp] of discoveryAttempts.entries()) {
      if (timestamp < cutoff) {
        discoveryAttempts.delete(key);
      }
    }

    // --- Now, fetch the tools based on the original request parameters ---
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status'); // e.g., 'ACTIVE' or 'INACTIVE'

    // Base conditions for fetching tools: filter by the authenticated user's active profile AND ensure parent server is ACTIVE
    const fetchConditions = [
      eq(mcpServersTable.profile_uuid, profileUuid),
      eq(mcpServersTable.status, McpServerStatus.ACTIVE) // Only fetch tools from ACTIVE servers
    ];

    // Add tool status filter if provided and valid
    const validatedStatus = validateToolStatus(statusParam ?? undefined); // Use helper
    fetchConditions.push(eq(toolsTable.status, validatedStatus));


    // Perform the query joining tools and servers tables to get current tools
    const currentToolsDb: DbTool[] = await db
      .select({
        // Select ALL columns from toolsTable to match DbTool type
        uuid: toolsTable.uuid,
        name: toolsTable.name,
        description: toolsTable.description,
        toolSchema: toolsTable.toolSchema,
        created_at: toolsTable.created_at,
        mcp_server_uuid: toolsTable.mcp_server_uuid,
        status: toolsTable.status,
        // Select server name for prefix/metadata
        serverName: mcpServersTable.name,
      })
      .from(toolsTable)
      .innerJoin(
        mcpServersTable,
        eq(toolsTable.mcp_server_uuid, mcpServersTable.uuid)
      )
      .where(and(...fetchConditions));

    // Map results to the expected MCP format
    const formattedTools: (McpTool & { _serverUuid: string })[] = currentToolsDb.map((tool: DbTool) => {
        return {
            name: tool.name, // Keep original name
            description: tool.description ?? undefined,
            inputSchema: tool.toolSchema as any,
            _serverUuid: tool.mcp_server_uuid,
            _serverName: tool.serverName ?? undefined
        };
    });

    // 5. Modify Response if discovery was triggered
    const responsePayload: { tools: (McpTool & { _serverUuid: string })[], message?: string } = {
      tools: formattedTools, // Return whatever tools are currently known matching the filter
    };

    if (discoveryTriggered) {
      // Use Set to avoid duplicate names if multiple requests trigger for the same server concurrently
      const uniqueServerNames = [...new Set(serversBeingDiscovered)];
      responsePayload.message = `Discovery initiated for servers: ${uniqueServerNames.join(', ')}. Full tool list may be available shortly.`;
    }

    const responseHeaders = new Headers();
    if (discoveryTriggered) {
      responseHeaders.set('X-Discovery-Status', 'pending');
    }

    return NextResponse.json(responsePayload, { headers: responseHeaders });

  } catch (error) {
    console.error("Error in GET /api/tools:", error); // More specific error log
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
