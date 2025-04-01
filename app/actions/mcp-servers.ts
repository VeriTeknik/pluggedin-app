'use server';

import { and, desc, eq, or } from 'drizzle-orm';

import { db } from '@/db';
import { McpServerSource, mcpServersTable, McpServerStatus, McpServerType } from '@/db/schema';
import type { McpServer } from '@/types/mcp-server';

import { trackServerInstallation } from './mcp-server-metrics';
import { discoverSingleServerTools } from './discover-mcp-tools'; // Import the discovery action

export async function getMcpServers(profileUuid: string) {
  const servers = await db
    .select()
    .from(mcpServersTable)
    .where(
      and(
        eq(mcpServersTable.profile_uuid, profileUuid),
        or(
          eq(mcpServersTable.status, McpServerStatus.ACTIVE),
          eq(mcpServersTable.status, McpServerStatus.INACTIVE)
        )
      )
    )
    .orderBy(desc(mcpServersTable.created_at));

  return servers as McpServer[];
}

export async function getMcpServerByUuid(
  profileUuid: string,
  uuid: string
): Promise<McpServer | undefined> {
  return await db.query.mcpServersTable.findFirst({
      where: and(
        eq(mcpServersTable.uuid, uuid),
        eq(mcpServersTable.profile_uuid, profileUuid)
      ),
    });
}

export async function deleteMcpServerByUuid(
  profileUuid: string,
  uuid: string
): Promise<void> {
  await db
    .delete(mcpServersTable)
    .where(
      and(
        eq(mcpServersTable.uuid, uuid),
        eq(mcpServersTable.profile_uuid, profileUuid)
      )
    );
}

export async function toggleMcpServerStatus(
  profileUuid: string,
  uuid: string,
  newStatus: McpServerStatus
): Promise<void> {
  await db
    .update(mcpServersTable)
    .set({ status: newStatus })
    .where(
      and(
        eq(mcpServersTable.uuid, uuid),
        eq(mcpServersTable.profile_uuid, profileUuid)
      )
    );
}

export async function updateMcpServer(
  profileUuid: string,
  uuid: string,
  data: {
    name?: string;
    description?: string | null;
    command?: string | null; // Allow null
    args?: string[];
    env?: { [key: string]: string };
    url?: string | null; // Allow null
    type?: McpServerType;
    notes?: string | null;
  }
): Promise<void> { // Changed return type to void as it doesn't explicitly return the server
  // Construct the update object carefully to handle undefined vs null
  const updateData: Partial<typeof mcpServersTable.$inferInsert> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description; // Handles null
  if (data.command !== undefined) updateData.command = data.command; // Handles null
  if (data.args !== undefined) updateData.args = data.args;
  if (data.env !== undefined) updateData.env = data.env;
  if (data.url !== undefined) updateData.url = data.url; // Handles null
  if (data.type !== undefined) updateData.type = data.type;
  if (data.notes !== undefined) updateData.notes = data.notes; // Handles null

  if (Object.keys(updateData).length === 0) {
    console.warn("updateMcpServer called with no fields to update.");
    return; // No fields to update
  }

  await db
    .update(mcpServersTable)
    .set(updateData)
    .where(
      and(
        eq(mcpServersTable.uuid, uuid),
        eq(mcpServersTable.profile_uuid, profileUuid)
      )
    );

  // Trigger discovery after update
  try {
    console.log(`[Action] Triggering tool discovery for updated server: ${uuid}`);
    // Don't await this, let it run in the background
    discoverSingleServerTools(profileUuid, uuid).catch(discoveryError => {
       console.error(`[Action Warning] Background tool discovery failed after update for server ${uuid}:`, discoveryError);
    });
  } catch (error) {
    // Catch synchronous errors if discoverSingleServerTools itself throws immediately (unlikely for async)
    console.error(`[Action Warning] Failed to trigger tool discovery after update for server ${uuid}:`, error);
    // Do not re-throw, allow the update operation to be considered successful
  }

  // Revalidate path if needed
  // revalidatePath('/mcp-servers');
}

export async function createMcpServer({
  name,
  profileUuid,
  description,
  command,
  args,
  env,
  type,
  url,
  source,
  external_id,
}: {
  name: string;
  profileUuid: string;
  description?: string;
  command?: string;
  args?: string[];
  env?: { [key: string]: string };
  type?: McpServerType;
  url?: string;
  source?: McpServerSource;
  external_id?: string;
}) { // Removed explicit return type to match actual returns
  try {
    const serverType = type || McpServerType.STDIO;

    // Validate inputs based on type
    if (serverType === McpServerType.STDIO && !command) {
      return { success: false, error: 'Command is required for STDIO servers' };
    }

    if (serverType === McpServerType.SSE && !url) {
      return { success: false, error: 'URL is required for SSE servers' };
    }

    const urlIsValid = url ? /^https?:\/\/.+/.test(url) : false;
    if (serverType === McpServerType.SSE && !urlIsValid) {
      return { success: false, error: 'URL must be a valid HTTP/HTTPS URL' };
    }

    // Insert and get the newly created server record
    const inserted = await db.insert(mcpServersTable).values({
      name,
      description,
      type: serverType,
      command: serverType === McpServerType.STDIO ? command : null,
      args: args || [],
      env: env || {},
      url: serverType === McpServerType.SSE ? url : null,
      profile_uuid: profileUuid,
      source,
      external_id,
    }).returning(); // Use returning() to get the inserted row

    const newServer = inserted[0]; // Get the first (and only) inserted row

    if (!newServer || !newServer.uuid) {
       throw new Error("Failed to retrieve new server details after insertion.");
    }

    // Track server installation
    try {
      await trackServerInstallation(
        profileUuid,
        newServer.uuid,
        external_id || null,
        source
      );
    } catch (trackingError) {
      console.error('Error tracking installation:', trackingError);
      // Continue even if tracking fails
    }

    // Trigger discovery after creation
    try {
      console.log(`[Action] Triggering tool discovery for created server: ${newServer.uuid}`);
      // Don't await this, let it run in the background
      discoverSingleServerTools(profileUuid, newServer.uuid).catch(discoveryError => {
         console.error(`[Action Warning] Background tool discovery failed after creation for server ${newServer.uuid}:`, discoveryError);
      });
    } catch (error) {
      // Catch synchronous errors if discoverSingleServerTools itself throws immediately (unlikely for async)
      console.error(`[Action Warning] Failed to trigger tool discovery after creation for server ${newServer.uuid}:`, error);
      // Do not re-throw, allow the creation operation to be considered successful
    }

    return { success: true, data: newServer }; // Return success and the new server data
  } catch (error) {
    console.error('Error creating MCP server:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function bulkImportMcpServers(
  data: {
    mcpServers: {
      [name: string]: {
        command?: string;
        args?: string[];
        env?: { [key: string]: string };
        description?: string;
        url?: string;
        type?: McpServerType;
      };
    };
  },
  profileUuid?: string | null
) {
  if (!profileUuid) {
    throw new Error('Current workspace not found');
  }

  const { mcpServers } = data;

  const serverEntries = Object.entries(mcpServers);
  const createdServerUuids: string[] = []; // Keep track of created UUIDs

  for (const [name, serverConfig] of serverEntries) {
    const serverData = {
      name,
      description: serverConfig.description || '',
      command: serverConfig.command || null,
      args: serverConfig.args || [],
      env: serverConfig.env || {},
      url: serverConfig.url || null,
      type: serverConfig.type || McpServerType.STDIO,
      profile_uuid: profileUuid,
      status: McpServerStatus.ACTIVE,
    };

    // Insert the server into the database
    const inserted = await db.insert(mcpServersTable).values(serverData).returning({ uuid: mcpServersTable.uuid });
    if (inserted[0]?.uuid) {
        createdServerUuids.push(inserted[0].uuid);
    }
  }

  // Trigger discovery for all newly created servers in the background
  if (createdServerUuids.length > 0 && profileUuid) {
      console.log(`[Action] Triggering background tool discovery for ${createdServerUuids.length} bulk imported servers...`);
      // Fire off discovery tasks without awaiting each one individually
      createdServerUuids.forEach(uuid => {
          discoverSingleServerTools(profileUuid, uuid).catch(discoveryError => {
              console.error(`[Action Warning] Background tool discovery failed during bulk import for server ${uuid}:`, discoveryError);
          });
      });
  }

  return { success: true, count: serverEntries.length };
}
