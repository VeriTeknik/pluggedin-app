import { and, eq,like, or } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { profilesTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    
    // Get search query from URL params
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    
    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        { error: 'Search query must be at least 2 characters' },
        { status: 400 }
      );
    }
    
    // Search for profiles by name or username
    const searchTerm = `%${query}%`;
    const profiles = await db.query.profilesTable.findMany({
      where: and(
        or(
          like(profilesTable.name, searchTerm),
          like(profilesTable.username, searchTerm)
        ),
        eq(profilesTable.is_public, true)
      ),
      limit: 20,
      columns: {
        uuid: true,
        name: true,
        username: true,
        avatar_url: true,
        bio: true,
        created_at: true,
        is_public: true,
      }
    });
    
    // Don't include private profiles in results
    const publicProfiles = profiles.filter(profile => profile.is_public);
    
    return NextResponse.json(publicProfiles);
  } catch (error) {
    console.error('Error searching users:', error);
    return NextResponse.json(
      { error: 'Failed to search users' },
      { status: 500 }
    );
  }
} 