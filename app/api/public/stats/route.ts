import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users, embeddedChatsTable, chatMessagesTable } from '@/db/schema';
import { eq, and, sql, gte } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    // Get total public users count
    const userCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(
        and(
          eq(users.is_public, true),
          sql`${users.username} IS NOT NULL`
        )
      );

    // Get total public assistants count
    const assistantCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(embeddedChatsTable)
      .where(
        and(
          eq(embeddedChatsTable.is_public, true),
          eq(embeddedChatsTable.is_active, true)
        )
      );

    // Get today's conversation count (messages from today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayMessages = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(chatMessagesTable)
      .where(gte(chatMessagesTable.created_at, today));

    return NextResponse.json({
      success: true,
      stats: {
        totalUsers: userCount[0]?.count || 0,
        totalAssistants: assistantCount[0]?.count || 0,
        todayMessages: todayMessages[0]?.count || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}