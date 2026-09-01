import { and, eq, like, or } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { users } from '@/db/schema';
import { PUBLIC_USER_COLUMNS, toPublicUser } from '@/lib/public-user';

export async function GET(request: NextRequest) {
  try {
    // Deliberately public: this searches profiles that opted into being public,
    // the same surface /to/<username> serves anonymously. There was a
    // getAuthSession() call here whose result was never read, which made the
    // route look guarded when it was not.
    //
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
    // Never the bare row: `users` is also the auth table, holding password,
    // two_fa_secret, two_fa_backup_codes, last_login_ip and email.
    const results = await db.query.users.findMany({
      where: and(
        or(
          like(users.name, searchTerm),
          like(users.username, searchTerm)
        ),
        eq(users.is_public, true)
      ),
      columns: PUBLIC_USER_COLUMNS,
      limit: 20
    });
    
    return NextResponse.json(results.map(toPublicUser));
  } catch (error) {
    console.error('Error searching users:', error);
    return NextResponse.json(
      { error: 'Failed to search users' },
      { status: 500 }
    );
  }
} 