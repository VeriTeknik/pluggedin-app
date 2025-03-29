'use server';

import { and, desc, eq, or } from 'drizzle-orm';

import { db } from '@/db';
import { McpServerSource, mcpServersTable, McpServerStatus, McpServerType } from '@/db/schema';
import type { McpServer } from '@/types/mcp-server';

import { trackServerInstallation } from './mcp-server-metrics';

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
): Promise<void> {
  // Construct the update object carefully to handle undefined vs null
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
}) {
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

    const _insertResult = await db.insert(mcpServersTable).values({
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
    });

    // Get generated UUID from inserted row
    const allServers = await db
      .select()
      .from(mcpServersTable)
      .where(eq(mcpServersTable.profile_uuid, profileUuid));
    
    const newServer = allServers.at(-1);

    // Track server installation
    if (newServer && newServer.uuid) {
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
    }

    return { success: true, data: newServer };
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
    await db.insert(mcpServersTable).values(serverData);
  }

  return { success: true, count: serverEntries.length };
}
