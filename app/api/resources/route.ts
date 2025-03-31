// app/api/resources/route.ts
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { authenticateApiKey } from '@/app/api/auth'; // Use path alias relative to app root
import { db } from '@/db';
import { mcpServersTable, resourcesTable, ToggleStatus } from '@/db/schema'; // Import ToggleStatus

// Define the expected structure for a single resource in the POST request
interface ResourceInput {
  uri: string;
  name?: string;
  description?: string;
  mime_type?: string;
  mcp_server_uuid: string;
  // Add other fields if necessary
}

// POST handler to receive and store/update resources
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

// GET handler to retrieve cached resources for the profile
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
