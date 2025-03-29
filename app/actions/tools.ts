import { db } from '@/db';
import { eq } from 'drizzle-orm';
import { toolsTable, ToolStatus } from '@/db/schema';

export async function getToolsByMcpServerUuid(mcpServerUuid: string) {
  try {
    return await db
      .select()
      .from(toolsTable)
      .where(eq(toolsTable.mcp_server_uuid, mcpServerUuid));
  } catch (error) {
    console.error('Error getting tools:', error);
    throw new Error('Failed to get tools');
  }
}

export async function toggleToolStatus(uuid: string, status: ToolStatus) {
  try {
    await db
      .update(toolsTable)
      .set({ status })
      .where(eq(toolsTable.uuid, uuid));
  } catch (error) {
    console.error('Error toggling tool status:', error);
    throw new Error('Failed to toggle tool status');
  }
}
