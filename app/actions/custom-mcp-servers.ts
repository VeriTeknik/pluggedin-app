'use server';

import { and, desc, eq, or } from 'drizzle-orm';

import { db } from '@/db';
import {
  codesTable,
  customMcpServersTable,
  McpServerStatus,
} from '@/db/schema';
import { withProfileAuth } from '@/lib/auth-helpers';
import { CustomMcpServer } from '@/types/custom-mcp-server';
import {
  CreateCustomMcpServerData,
  UpdateCustomMcpServerData,
} from '@/types/custom-mcp-server';

export async function getCustomMcpServers(profileUuid: string) {
  return withProfileAuth(profileUuid, async (session) => {
  const servers = await db
    .select({
      uuid: customMcpServersTable.uuid,
      name: customMcpServersTable.name,
      description: customMcpServersTable.description,
      code_uuid: customMcpServersTable.code_uuid,
      additionalArgs: customMcpServersTable.additionalArgs,
      env: customMcpServersTable.env,
      created_at: customMcpServersTable.created_at,
      profile_uuid: customMcpServersTable.profile_uuid,
      status: customMcpServersTable.status,
      code: codesTable.code,
      codeFileName: codesTable.fileName,
    })
    .from(customMcpServersTable)
    .leftJoin(codesTable, and(eq(customMcpServersTable.code_uuid, codesTable.uuid), eq(codesTable.user_id, session.user.id)))
    .where(
      and(
        eq(customMcpServersTable.profile_uuid, profileUuid),
        or(
          eq(customMcpServersTable.status, McpServerStatus.ACTIVE),
          eq(customMcpServersTable.status, McpServerStatus.INACTIVE)
        )
      )
    )
    .orderBy(desc(customMcpServersTable.created_at));

  return servers as CustomMcpServer[];
  });
}

export async function getCustomMcpServerByUuid(
  profileUuid: string,
  uuid: string
): Promise<CustomMcpServer | null> {
  return withProfileAuth(profileUuid, async (session) => {
  const server = await db
    .select({
      uuid: customMcpServersTable.uuid,
      name: customMcpServersTable.name,
      description: customMcpServersTable.description,
      code_uuid: customMcpServersTable.code_uuid,
      additionalArgs: customMcpServersTable.additionalArgs,
      env: customMcpServersTable.env,
      created_at: customMcpServersTable.created_at,
      profile_uuid: customMcpServersTable.profile_uuid,
      status: customMcpServersTable.status,
      code: codesTable.code,
      codeFileName: codesTable.fileName,
    })
    .from(customMcpServersTable)
    .leftJoin(codesTable, and(eq(customMcpServersTable.code_uuid, codesTable.uuid), eq(codesTable.user_id, session.user.id)))
    .where(
      and(
        eq(customMcpServersTable.uuid, uuid),
        eq(customMcpServersTable.profile_uuid, profileUuid)
      )
    )
    .limit(1);

  if (server.length === 0) {
    return null;
  }

  return server[0] as CustomMcpServer;
  });
}

export async function deleteCustomMcpServerByUuid(
  profileUuid: string,
  uuid: string
): Promise<void> {
  return withProfileAuth(profileUuid, async (session) => {
  // First get the code_uuid
  const server = await db
    .select({ code_uuid: customMcpServersTable.code_uuid })
    .from(customMcpServersTable)
    .where(
      and(
        eq(customMcpServersTable.uuid, uuid),
        eq(customMcpServersTable.profile_uuid, profileUuid)
      )
    )
    .limit(1);

  if (server.length > 0) {
    // Delete the custom MCP server first
    await db
      .delete(customMcpServersTable)
      .where(
        and(
          eq(customMcpServersTable.uuid, uuid),
          eq(customMcpServersTable.profile_uuid, profileUuid)
        )
      );
  }
  });
}

export async function toggleCustomMcpServerStatus(
  profileUuid: string,
  uuid: string,
  newStatus: McpServerStatus
): Promise<void> {
  return withProfileAuth(profileUuid, async (session) => {
  await db
    .update(customMcpServersTable)
    .set({ status: newStatus })
    .where(
      and(
        eq(customMcpServersTable.uuid, uuid),
        eq(customMcpServersTable.profile_uuid, profileUuid)
      )
    );
  });
}

export async function createCustomMcpServer(
  profileUuid: string,
  data: CreateCustomMcpServerData
) {
  return withProfileAuth(profileUuid, async (session) => {
  if (data.code_uuid !== undefined) {
    const code = await db.query.codesTable.findFirst({
      where: and(eq(codesTable.uuid, data.code_uuid), eq(codesTable.user_id, session.user.id)),
      columns: { uuid: true },
    });
    if (!code) throw new Error('Code not found');
  }

  const [server] = await db
    .insert(customMcpServersTable)
    .values({
      profile_uuid: profileUuid,
      name: data.name,
      description: data.description || '',
      code_uuid: data.code_uuid,
      additionalArgs: data.additionalArgs || [],
      env: data.env || {},
      status: McpServerStatus.ACTIVE,
    })
    .returning();

  return server;
  });
}

export async function updateCustomMcpServer(
  profileUuid: string,
  uuid: string,
  data: UpdateCustomMcpServerData
): Promise<void> {
  return withProfileAuth(profileUuid, async (session) => {
  if (data.code_uuid !== undefined) {
    const code = await db.query.codesTable.findFirst({
      where: and(eq(codesTable.uuid, data.code_uuid), eq(codesTable.user_id, session.user.id)),
      columns: { uuid: true },
    });
    if (!code) throw new Error('Code not found');
  }

  await db
    .update(customMcpServersTable)
    .set({
      name: data.name,
      description: data.description,
      code_uuid: data.code_uuid,
      additionalArgs: data.additionalArgs,
      env: data.env,
    })
    .where(
      and(
        eq(customMcpServersTable.uuid, uuid),
        eq(customMcpServersTable.profile_uuid, profileUuid)
      )
    );
  });
}
