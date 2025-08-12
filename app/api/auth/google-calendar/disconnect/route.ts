import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { accounts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getAuthSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delete the user's Google account connection
    const result = await db.delete(accounts)
      .where(and(
        eq(accounts.userId, session.user.id),
        eq(accounts.provider, 'google')
      ));

    return NextResponse.json({ 
      success: true,
      message: 'Google account disconnected. You can now reconnect with calendar permissions.'
    });
  } catch (error) {
    console.error('Disconnect error:', error);
    return NextResponse.json({ error: 'Failed to disconnect Google account' }, { status: 500 });
  }
}