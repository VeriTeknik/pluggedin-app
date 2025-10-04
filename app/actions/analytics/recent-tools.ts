import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { mcpActivityTable, mcpServersTable } from '@/db/schema';
import { withAnalytics, analyticsSchemas } from '../analytics-hof';

export interface ToolCallLogEntry {
  id: number;
  timestamp: Date;
  action: string;
  tool_name: string | null;
  server_name: string | null;
  server_uuid: string | null;
  external_id: string | null;
}

export const getRecentToolCalls = withAnalytics(
  // Parse and validate inputs
  (profileUuid: string, limit: number = 50) => ({
    profileUuid: analyticsSchemas.profileUuid.parse(profileUuid),
    limit: analyticsSchemas.limit.parse(limit),
  }),

  // Rate limit key
  (userId) => `analytics:toolCalls:${userId}`,

  // Handler with business logic
  async ({ profileUuid, limit }) => {
    // Get recent tool call activity
    const recentCalls = await db
      .select({
        id: mcpActivityTable.id,
        timestamp: mcpActivityTable.created_at,
        action: mcpActivityTable.action,
        tool_name: mcpActivityTable.item_name,
        server_name: mcpServersTable.name,
        server_uuid: mcpActivityTable.server_uuid,
        external_id: mcpActivityTable.external_id,
      })
      .from(mcpActivityTable)
      .leftJoin(mcpServersTable, eq(mcpActivityTable.server_uuid, mcpServersTable.uuid))
      .where(
        and(
          eq(mcpActivityTable.profile_uuid, profileUuid),
          eq(mcpActivityTable.action, 'tool_call')
        )
      )
      .orderBy(desc(mcpActivityTable.created_at))
      .limit(limit);

    return recentCalls.map(call => ({
      id: call.id,
      timestamp: call.timestamp,
      action: call.action,
      tool_name: call.tool_name,
      server_name: call.server_name,
      server_uuid: call.server_uuid,
      external_id: call.external_id,
    }));
  }
);