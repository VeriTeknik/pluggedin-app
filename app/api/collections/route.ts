import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { sharedCollectionsTable } from '@/db/schema';

export async function GET() {
  try {
    // Fetch all public collections with profile, project, and user info
    const collections = await db.query.sharedCollectionsTable.findMany({
      where: eq(sharedCollectionsTable.is_public, true),
      with: {
        profile: {
          with: {
            project: {
              with: {
                user: {
                  columns: {
                    id: true,
                    name: true,
                    username: true
                  }
                }
              }
            }
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