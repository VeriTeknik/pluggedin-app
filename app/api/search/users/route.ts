import { and, eq, like, or } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { users } from '@/db/schema';
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
    const results = await db.query.users.findMany({
      where: and(
        or(
          like(users.name, searchTerm),
          like(users.username, searchTerm)
        ),
        eq(users.is_public, true)
      ),
      limit: 20
    });
    
    return NextResponse.json(results);
  } catch (error) {
    console.error('Error searching users:', error);
    return NextResponse.json(
      { error: 'Failed to search users' },
      { status: 500 }
    );
  }
} 