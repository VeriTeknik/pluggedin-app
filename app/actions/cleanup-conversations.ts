'use server';

import { and, eq, lt, sql } from 'drizzle-orm';

import { db } from '@/db';
import { chatConversationsTable } from '@/db/schema';

/**
 * Clean up stale active conversations that haven't had a heartbeat in over 30 minutes
 */
export async function cleanupStaleConversations() {
  try {
    // Calculate timestamp 30 minutes ago
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    // Update stale conversations to ended status
    const result = await db
      .update(chatConversationsTable)
      .set({
        status: 'ended',
        ended_at: new Date(),
        updated_at: new Date(),
        metadata: sql`jsonb_set(COALESCE(metadata, '{}'::jsonb), '{ended_reason}', '"stale_timeout"', true)`,
      })
      .where(and(
        eq(chatConversationsTable.status, 'active'),
        lt(chatConversationsTable.last_heartbeat, thirtyMinutesAgo)
      ));
    
    return { 
      success: true, 
      cleanedCount: result.rowCount || 0 
    };
  } catch (error) {
    console.error('Error cleaning up stale conversations:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to cleanup conversations' 
    };
  }
}

/**
 * Get stale conversation count for monitoring
 */
export async function getStaleConversationCount() {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    const [result] = await db
      .select({ 
        count: sql<number>`count(*)::int` 
      })
      .from(chatConversationsTable)
      .where(and(
        eq(chatConversationsTable.status, 'active'),
        lt(chatConversationsTable.last_heartbeat, thirtyMinutesAgo)
      ));
    
    return { 
      success: true, 
      count: result?.count || 0 
    };
  } catch (error) {
    console.error('Error counting stale conversations:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to count stale conversations' 
    };
  }
}