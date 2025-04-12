import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';

import { db } from '@/db';
import { sharedMcpServersTable } from '@/db/schema';
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
    
    // Fetch public shared servers for this profile
    const sharedServers = await db.query.sharedMcpServersTable.findMany({
      where: and(
        eq(sharedMcpServersTable.profile_uuid, profileId),
        eq(sharedMcpServersTable.is_public, true)
      ),
      with: {
        server: {
          columns: {
            uuid: true,
            name: true,
            description: true,
            type: true,
            command: true,
            args: true,
            url: true,
            created_at: true,
            status: true,
            source: true,
          }
        },
        profile: {
          columns: {
            uuid: true,
            name: true,
            bio: true,
            is_public: true,
            avatar_url: true,
          }
        }
      },
    });
    
    // Sort by created_at in memory since we're having issues with the orderBy syntax
    const sortedServers = [...sharedServers].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    return NextResponse.json(sortedServers);
  } catch (error) {
    console.error('Error fetching shared servers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shared servers' },
      { status: 500 }
    );
  }
} 