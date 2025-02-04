import { and, desc, eq, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import {
  codesTable,
  customMcpServersTable,
  McpServerStatus,
} from '@/db/schema';

import { authenticateApiKey } from '../auth';

export async function GET(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;

    const customMcpServers = await db
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
      .leftJoin(
        codesTable,
        eq(customMcpServersTable.code_uuid, codesTable.uuid)
      )
      .where(
        and(
          eq(customMcpServersTable.profile_uuid, auth.activeProfile.uuid),
          or(
            eq(customMcpServersTable.status, McpServerStatus.ACTIVE),
            eq(customMcpServersTable.status, McpServerStatus.INACTIVE)
          )
        )
      )
      .orderBy(desc(customMcpServersTable.created_at));

    return NextResponse.json(customMcpServers);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Failed to fetch custom MCP servers' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const { name, description, code_uuid, additionalArgs, env } = body;

    const [newCustomMcpServer] = await db
      .insert(customMcpServersTable)
      .values({
        name,
        description,
        code_uuid,
        additionalArgs,
        env,
        status: McpServerStatus.ACTIVE,
        profile_uuid: auth.activeProfile.uuid,
      })
      .returning();

    return NextResponse.json(newCustomMcpServer);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Failed to create custom MCP server' },
      { status: 500 }
    );
  }
}
