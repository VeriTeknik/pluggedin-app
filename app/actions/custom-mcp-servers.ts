'use server';

import { and, eq, or } from 'drizzle-orm';

import { db } from '@/db';
import { mcpServersTable, McpServerStatus } from '@/db/schema';
import { CustomMcpServer } from '@/types/custom-mcp-server';
import {
  CreateCustomMcpServerData,
  UpdateCustomMcpServerData,
} from '@/types/custom-mcp-server';

export async function getCustomMcpServers(profileUuid: string) {
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
    );

  return servers as CustomMcpServer[];
}

export async function getCustomMcpServerByUuid(
  profileUuid: string,
  uuid: string
): Promise<CustomMcpServer | null> {
  const server = await db
    .select()
    .from(mcpServersTable)
    .where(
      and(
        eq(mcpServersTable.uuid, uuid),
        eq(mcpServersTable.profile_uuid, profileUuid)
      )
    )
    .limit(1);

  if (server.length === 0) {
    return null;
  }

  return server[0] as CustomMcpServer;
}

export async function deleteCustomMcpServerByUuid(
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

export async function toggleCustomMcpServerStatus(
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

export async function createCustomMcpServer(
  profileUuid: string,
  data: CreateCustomMcpServerData
): Promise<CustomMcpServer> {
  const [server] = await db
    .insert(mcpServersTable)
    .values({
      profile_uuid: profileUuid,
      name: data.name,
      description: data.description || '',
      command: data.command,
      args: data.args || [],
      env: data.env || {},
      status: McpServerStatus.ACTIVE,
    })
    .returning();

  return server as CustomMcpServer;
}

export async function updateCustomMcpServer(
  profileUuid: string,
  uuid: string,
  data: UpdateCustomMcpServerData
): Promise<void> {
  await db
    .update(mcpServersTable)
    .set({
      ...data,
    })
    .where(
      and(
        eq(mcpServersTable.uuid, uuid),
        eq(mcpServersTable.profile_uuid, profileUuid)
      )
    );
}
