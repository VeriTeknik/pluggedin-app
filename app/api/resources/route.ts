// app/api/resources/route.ts
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { authenticateApiKey } from '@/app/api/auth'; // Use path alias relative to app root
import { db } from '@/db';
import { mcpServersTable, resourcesTable, ToggleStatus } from '@/db/schema';

/**
 * Represents the expected input structure for a single resource in the POST request body.
 */
interface ResourceInput {
  uri: string;
  name?: string;
  description?: string;
  mime_type?: string;
  mcp_server_uuid: string;
  // Add other fields if necessary
}

/**
 * @swagger
 * /api/resources:
 *   post:
 *     summary: Report/Update resources from MCP Proxy
 *     description: Allows the pluggedin-mcp proxy server (or other authorized clients) to report discovered resources for specific MCP servers belonging to the authenticated user's profile. Performs an upsert operation based on mcp_server_uuid and resource URI. Requires API key authentication.
 *     tags:
 *       - Resources
 *     security:
 *       - apiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - resources
 *             properties:
 *               resources:
 *                 type: array
 *                 description: An array of resource objects to report/update.
 *                 items:
 *                   type: object
 *                   required:
 *                     - uri
 *                     - mcp_server_uuid
 *                   properties:
 *                     uri:
 *                       type: string
 *                       format: uri
 *                     name:
 *                       type: string
 *                       nullable: true
 *                     description:
 *                       type: string
 *                       nullable: true
 *                     mime_type:
 *                       type: string
 *                       nullable: true
 *                     mcp_server_uuid:
 *                       type: string
 *                       format: uuid
 *     responses:
 *       200:
 *         description: Resources processed successfully. May include validation errors for specific resources.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 successCount:
 *                   type: integer
 *                 errorCount:
 *                   type: integer
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object # Structure of error objects
 *       400:
 *         description: Bad Request - Invalid request body (e.g., missing 'resources' array).
 *       401:
 *         description: Unauthorized - Invalid or missing API key or profile.
 *       500:
 *         description: Internal Server Error - Database error or other server-side issue.
 */
export async function POST(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;
    if (!auth.activeProfile) {
      return NextResponse.json({ error: 'Active profile not found' }, { status: 401 });
    }

    const body = await request.json();
    const resourcesInput: ResourceInput[] = body.resources;

    if (!Array.isArray(resourcesInput)) {
      return NextResponse.json({ error: 'Request body must contain an array of resources' }, { status: 400 });
    }

    const profileUuid = auth.activeProfile.uuid;
    const upsertResults = [];
    const errors = [];

    // Get valid server UUIDs for this profile to prevent cross-profile contamination
    const validServerUuids = await db.select({ uuid: mcpServersTable.uuid })
      .from(mcpServersTable)
      .where(eq(mcpServersTable.profile_uuid, profileUuid));
    const validUuidSet = new Set(validServerUuids.map(s => s.uuid));

    // Process resources in batches or individually
    for (const resource of resourcesInput) {
      if (!resource.uri || !resource.mcp_server_uuid) {
        errors.push({ resource, error: 'Missing required fields: uri or mcp_server_uuid' });
        continue;
      }

      // Ensure the resource belongs to a server owned by this profile
      if (!validUuidSet.has(resource.mcp_server_uuid)) {
         errors.push({ resource, error: 'MCP server UUID does not belong to the authenticated profile' });
         continue;
      }

      try {
        // Use ON CONFLICT to perform an UPSERT operation
        const result = await db.insert(resourcesTable)
          .values({
            mcp_server_uuid: resource.mcp_server_uuid,
            uri: resource.uri,
            name: resource.name,
            description: resource.description,
            mime_type: resource.mime_type,
            status: ToggleStatus.ACTIVE, // Use Enum
          })
          .onConflictDoUpdate({
            target: [resourcesTable.mcp_server_uuid, resourcesTable.uri], // Unique constraint
            set: {
              name: resource.name,
              description: resource.description,
              mime_type: resource.mime_type,
              status: ToggleStatus.ACTIVE, // Use Enum
              // created_at is not updated on conflict
            },
          })
          .returning(); // Return the upserted record

        upsertResults.push(result[0]);
      } catch (dbError) {
        console.error(`Error upserting resource ${resource.uri}:`, dbError);
        errors.push({ resource, error: 'Database error during upsert' });
      }
    }

    // Optionally: Mark resources not present in the input as INACTIVE for the specific server?
    // This requires knowing which server's resources were reported in this batch.
    // For simplicity, we'll only handle upserts for now. Deactivation could be a separate process.

    return NextResponse.json({
      message: `Processed ${resourcesInput.length} resources.`,
      successCount: upsertResults.length,
      errorCount: errors.length,
      errors: errors, // Include details of errors
    });

  } catch (error) {
    console.error('Error processing POST /api/resources:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/resources:
 *   get:
 *     summary: Get active resources for the active profile
 *     description: Retrieves a list of all ACTIVE resources associated with the authenticated user's active profile, joined with their parent MCP server name. Requires API key authentication.
 *     tags:
 *       - Resources
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: Successfully retrieved resources.
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
 *                       uuid:
 *                         type: string
 *                         format: uuid
 *                       mcp_server_uuid:
 *                         type: string
 *                         format: uuid
 *                       uri:
 *                         type: string
 *                         format: uri
 *                       name:
 *                         type: string
 *                         nullable: true
 *                       description:
 *                         type: string
 *                         nullable: true
 *                       mime_type:
 *                         type: string
 *                         nullable: true
 *                       status:
 *                         $ref: '#/components/schemas/ToggleStatus' # Assuming ToggleStatus is defined
 *                       serverName:
 *                         type: string
 *                         description: Name of the parent MCP server.
 *       401:
 *         description: Unauthorized - Invalid or missing API key or profile.
 *       500:
 *         description: Internal Server Error.
 */
export async function GET(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;
    if (!auth.activeProfile) {
      return NextResponse.json({ error: 'Active profile not found' }, { status: 401 });
    }

    const profileUuid = auth.activeProfile.uuid;

    // Fetch all ACTIVE resources linked to servers belonging to the active profile
    const results = await db
      .select({
        uuid: resourcesTable.uuid,
        mcp_server_uuid: resourcesTable.mcp_server_uuid,
        uri: resourcesTable.uri,
        name: resourcesTable.name,
        description: resourcesTable.description,
        mime_type: resourcesTable.mime_type,
        status: resourcesTable.status,
        // Include server name for easier prefixing/display later
        serverName: mcpServersTable.name,
      })
      .from(resourcesTable)
      .innerJoin(mcpServersTable, eq(resourcesTable.mcp_server_uuid, mcpServersTable.uuid))
      .where(and(
        eq(mcpServersTable.profile_uuid, profileUuid),
        eq(resourcesTable.status, ToggleStatus.ACTIVE) // Use Enum
      ));

    return NextResponse.json({ results });

  } catch (error) {
    console.error('Error processing GET /api/resources:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
