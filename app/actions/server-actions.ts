'use server';

import { and,eq } from 'drizzle-orm';

import { db } from '@/db';
import { mcpServersTable, McpServerStatus, ProfileCapability,profilesTable } from '@/db/schema'; // Import ProfileCapability

export async function updateProfileCapabilities(uuid: string, capabilities: ProfileCapability[]) { // Change type to ProfileCapability[]
  try {
    await db
      .update(profilesTable)
      .set({ enabled_capabilities: capabilities })
      .where(eq(profilesTable.uuid, uuid));
  } catch (error) {
    console.error('Error updating profile capabilities:', error);
    throw new Error('Failed to update profile capabilities');
  }
}

export async function getMcpServers(profileUuid: string, status: McpServerStatus) {
  try {
    return await db
          .select()
          .from(mcpServersTable)
          .where(
            and(
              eq(mcpServersTable.profile_uuid, profileUuid),
              eq(mcpServersTable.status, status)
            )
          );
  } catch (error) {
    console.error('Error getting MCP servers:', error);
    throw new Error('Failed to get MCP servers');
  }
}

export async function getFirstApiKey(projectUuid: string) {
  try {
    const apiKey = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.project_uuid, projectUuid))
      .limit(1);

    return apiKey[0];
  } catch (error) {
    console.error('Error getting API key:', error);
    throw new Error('Failed to get API key');
  }
}
