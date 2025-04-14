import { and, asc, eq, type InferSelectModel } from 'drizzle-orm';
import { NextResponse } from 'next/server'; // Moved up

import { db } from '@/db';
import { apiKeysTable, mcpServersTable, McpServerStatus, projectsTable, resourcesTable } from '@/db/schema';

// Infer Resource type from DB schema
type DbResource = InferSelectModel<typeof resourcesTable>;
// Define the type expected by MCP spec (adjust if needed based on actual SDK types if import worked)
type McpResource = {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
  size?: number; // Keep size optional as per spec, even if not in DB
};


export const dynamic = 'force-dynamic'; // Ensure fresh data on each request

/**
 * @swagger
 * /api/resources:
 *   get:
 *     summary: Get discovered static resources for the active profile
 *     description: |
 *       Retrieves a list of discovered static resources associated with the authenticated user's active profile.
 *       Only resources linked to **active** MCP servers within that profile are included.
 *       The response is formatted to mimic the MCP Resource list structure (`ListResourcesResult`) for compatibility with the pluggedin-mcp proxy.
 *       Requires API key authentication.
 *     tags:
 *       - Resources
 *       - MCP Servers
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: Successfully retrieved discovered static resources, ordered by name.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   uri:
 *                     type: string
 *                     description: The URI of the resource.
 *                   name:
 *                     type: string
 *                     description: The name of the resource (defaults to URI if not provided).
 *                     nullable: true
 *                   description:
 *                     type: string
 *                     description: The description of the resource.
 *                     nullable: true
 *                   mimeType:
 *                     type: string
 *                     description: The media type (MIME type) of the resource.
 *                     nullable: true
 *                   size:
 *                     type: number
 *                     description: The size of the resource in bytes (currently not available from DB).
 *                     nullable: true
 *       401:
 *         description: Unauthorized - Invalid or missing API key or cannot determine active profile.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Unauthorized: Missing or invalid API key. | Unauthorized: Invalid API key. | Unauthorized: Cannot determine active profile for API key.
 *       500:
 *         description: Internal Server Error fetching resources.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Internal Server Error
 *                 details:
 *                   type: string
 */
export async function GET(request: Request) {
  try {
    // 1. Extract API Key
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid API key.' }, { status: 401 });
    }
    const apiKey = authHeader.split(' ')[1];

    // 2. Validate API Key and get associated Project UUID
    const keyData = await db.query.apiKeysTable.findFirst({
      where: eq(apiKeysTable.api_key, apiKey), // Use correct column name
      columns: {
        project_uuid: true,
        // No status column on apiKeysTable
      },
    });

    if (!keyData) {
      return NextResponse.json({ error: 'Unauthorized: Invalid API key.' }, { status: 401 });
    }
    const projectUuid = keyData.project_uuid;

    // 3. Get the Active Profile UUID for the Project
    const projectData = await db.query.projectsTable.findFirst({
        where: eq(projectsTable.uuid, projectUuid),
        columns: {
            active_profile_uuid: true,
        },
    });

    if (!projectData || !projectData.active_profile_uuid) {
        // If no project found or no active profile set for the project
        return NextResponse.json({ error: 'Unauthorized: Cannot determine active profile for API key.' }, { status: 401 });
    }
    const profileUuid = projectData.active_profile_uuid;


    // 4. Query Resources for Active Servers in the Active Profile
    const discoveredResources: DbResource[] = await db
      .select({
        // Select fields from the resources table
        uuid: resourcesTable.uuid, // Keep internal fields if needed later
        mcp_server_uuid: resourcesTable.mcp_server_uuid,
        uri: resourcesTable.uri,
        name: resourcesTable.name,
        description: resourcesTable.description,
        mime_type: resourcesTable.mime_type,
        created_at: resourcesTable.created_at,
        status: resourcesTable.status,
        // No 'size' column in schema
      })
      .from(resourcesTable)
      .innerJoin(mcpServersTable, eq(resourcesTable.mcp_server_uuid, mcpServersTable.uuid))
      .where(
        and(
          eq(mcpServersTable.profile_uuid, profileUuid),
          eq(mcpServersTable.status, McpServerStatus.ACTIVE) // Use correct Enum for mcpServersTable
        )
      )
      .orderBy(asc(resourcesTable.name)); // Optional: order results

    // 5. Format response according to MCP spec
    // Map DB results to the expected MCP Resource structure
    const responsePayload: McpResource[] = discoveredResources.map(r => ({
        uri: r.uri,
        name: r.name ?? r.uri, // Use URI as fallback name
        description: r.description ?? undefined,
        mimeType: r.mime_type ?? undefined,
        // size: undefined, // No size in DB schema
    }));


    // Return the array of resources, matching the structure { resources: Resource[] } if needed by proxy
    // For now, returning the array directly as planned.
    return NextResponse.json(responsePayload);

  } catch (error) {
    console.error('[API /api/resources Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
}
