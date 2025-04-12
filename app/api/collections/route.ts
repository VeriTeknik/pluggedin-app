import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { sharedCollectionsTable } from '@/db/schema';

export async function GET() {
  try {
    // Fetch all public collections
    const collections = await db.query.sharedCollectionsTable.findMany({
      where: eq(sharedCollectionsTable.is_public, true),
      with: {
        profile: {
          columns: {
            uuid: true,
            name: true,
            bio: true,
            is_public: true,
            avatar_url: true,
            username: true,
          }
        }
      },
      orderBy: (collections) => [collections.created_at],
    });

    return NextResponse.json(collections);
  } catch (error) {
    console.error('Error fetching collections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch collections' },
      { status: 500 }
    );
  }
} 