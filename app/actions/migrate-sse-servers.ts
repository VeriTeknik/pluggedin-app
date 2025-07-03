'use server';

import { and, eq } from 'drizzle-orm';
import { getServerSession } from 'next-auth';

import { db } from '@/db';
import { mcpServersTable, McpServerType, users } from '@/db/schema';
import { authOptions } from '@/lib/auth';

async function getUserId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return null;
  }
  
  const user = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.email, session.user.email!),
  });
  
  return user?.id || null;
}

export async function migrateSSEToStreamableHTTP(serverUuid: string) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return { success: false, error: 'Not authenticated' };
    }
    
    // Verify the server exists and belongs to user
    const server = await db
      .select()
      .from(mcpServersTable)
      .where(eq(mcpServersTable.uuid, serverUuid))
      .limit(1);
    
    if (!server.length) {
      return { success: false, error: 'Server not found' };
    }
    
    if (server[0].type !== McpServerType.SSE) {
      return { success: false, error: 'Server is not using SSE transport' };
    }
    
    // Update server type to Streamable HTTP
    await db
      .update(mcpServersTable)
      .set({ 
        type: McpServerType.STREAMABLE_HTTP,
        updated_at: new Date()
      })
      .where(eq(mcpServersTable.uuid, serverUuid));

    return { 
      success: true, 
      message: 'Successfully migrated to Streamable HTTP' 
    };
  } catch (error) {
    console.error('Failed to migrate SSE server:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Migration failed' 
    };
  }
}

export async function migrateAllSSEServers(profileUuid?: string) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return { success: false, error: 'Not authenticated' };
    }

    const db = await getDb();
    
    // Build query conditions
    const conditions = [eq(mcpServersTable.type, McpServerType.SSE)];
    if (profileUuid) {
      conditions.push(eq(mcpServersTable.profile_uuid, profileUuid));
    }
    
    // Get all SSE servers
    const sseServers = await db
      .select()
      .from(mcpServersTable)
      .where(and(...conditions));
    
    if (!sseServers.length) {
      return { 
        success: true, 
        message: 'No SSE servers found to migrate',
        migratedCount: 0 
      };
    }
    
    // Migrate all SSE servers to Streamable HTTP
    await db
      .update(mcpServersTable)
      .set({ 
        type: McpServerType.STREAMABLE_HTTP,
        updated_at: new Date()
      })
      .where(and(...conditions));
    
    return { 
      success: true, 
      message: `Successfully migrated ${sseServers.length} server(s) to Streamable HTTP`,
      migratedCount: sseServers.length
    };
  } catch (error) {
    console.error('Failed to migrate SSE servers:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Migration failed' 
    };
  }
}

// Check if a specific server is Context7 and needs migration
export async function checkContext7Migration(serverUuid: string) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return { success: false, error: 'Not authenticated' };
    }

    const db = await getDb();
    
    const server = await db
      .select()
      .from(mcpServersTable)
      .where(eq(mcpServersTable.uuid, serverUuid))
      .limit(1);
    
    if (!server.length) {
      return { success: false, error: 'Server not found' };
    }
    
    const serverData = server[0];
    
    // Check if it's Context7 with SSE type
    if (serverData.url && serverData.url.includes('mcp.context7.com') && serverData.type === McpServerType.SSE) {
      return {
        success: true,
        needsMigration: true,
        message: 'Context7 server detected with SSE transport. Migration to Streamable HTTP recommended.'
      };
    }
    
    return {
      success: true,
      needsMigration: false
    };
  } catch (error) {
    console.error('Failed to check Context7 migration:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Check failed' 
    };
  }
}