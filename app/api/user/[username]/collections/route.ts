import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { sharedCollectionsTable } from '@/db/schema';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await context.params;
    
    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Find the user's profile and associated collections
    const collections = await db.query.sharedCollectionsTable.findMany({
      where: and(
        eq(sharedCollectionsTable.is_public, true)
      ),
      with: {
        profile: {
          with: {
            project: {
              with: {
                user: {
                  columns: {
                    username: true,
                    name: true
                  }
                }
              }
            }
          }
        }
      }
    });

    // Filter collections for the specific username
    const userCollections = collections.filter(
      collection => collection.profile?.project?.user?.username === username
    );
    
    // Sort by created_at in descending order
    const sortedCollections = [...userCollections].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    return NextResponse.json(sortedCollections);
  } catch (error) {
    console.error('Error fetching user collections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user collections' },
      { status: 500 }
    );
  }
} 