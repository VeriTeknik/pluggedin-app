import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';

import { db } from '@/db';
import { sharedCollectionsTable } from '@/db/schema';
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
    
    // Fetch public shared collections for this profile
    const sharedCollections = await db.query.sharedCollectionsTable.findMany({
      where: and(
        eq(sharedCollectionsTable.profile_uuid, profileId),
        eq(sharedCollectionsTable.is_public, true)
      ),
      with: {
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
    const sortedCollections = [...sharedCollections].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    return NextResponse.json(sortedCollections);
  } catch (error) {
    console.error('Error fetching shared collections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shared collections' },
      { status: 500 }
    );
  }
} 