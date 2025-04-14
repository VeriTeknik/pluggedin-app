import { and,eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { embeddedChatsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ profileId: string }> }
) {
  try {
    const session = await getAuthSession();
    const { profileId } = await context.params;
    
    if (!profileId) {
      return NextResponse.json(
        { error: 'Profile ID is required' },
        { status: 400 }
      );
    }
    
    // Fetch public and active embedded chats for this profile
    const embeddedChats = await db.query.embeddedChatsTable.findMany({
      where: and(
        eq(embeddedChatsTable.profile_uuid, profileId),
        eq(embeddedChatsTable.is_public, true),
        eq(embeddedChatsTable.is_active, true)
      ),
      with: {
        profile: {
          columns: {
            uuid: true,
            name: true,
            project_uuid: true
          }
        }
      }
    });
    
    // Sort by created_at in memory
    const sortedChats = [...embeddedChats].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    return NextResponse.json(sortedChats);
  } catch (error) {
    console.error('Error fetching embedded chats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch embedded chats' },
      { status: 500 }
    );
  }
} 