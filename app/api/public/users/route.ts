import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users, embeddedChatsTable, projectsTable } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    // Parse query parameters
    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '12', 10);
    const offset = (page - 1) * limit;

    // First get the total count
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(
        and(
          eq(users.is_public, true),
          sql`${users.username} IS NOT NULL`
        )
      );
    
    const totalCount = countResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / limit);

    // Fetch public users with assistant counts using a subquery
    const publicUsersWithCounts = await db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        image: users.image,
        avatar_url: users.avatar_url,
        bio: users.bio,
        assistant_count: sql<number>`
          COALESCE(
            (
              SELECT COUNT(DISTINCT ec.uuid)::int
              FROM ${embeddedChatsTable} ec
              INNER JOIN ${projectsTable} p ON ec.project_uuid = p.uuid
              WHERE p.user_id = ${users.id}
                AND ec.is_public = true
                AND ec.is_active = true
            ),
            0
          )
        `.as('assistant_count'),
      })
      .from(users)
      .where(
        and(
          eq(users.is_public, true),
          sql`${users.username} IS NOT NULL`
        )
      )
      .orderBy(sql`COALESCE(
        (
          SELECT COUNT(DISTINCT ec.uuid)::int
          FROM ${embeddedChatsTable} ec
          INNER JOIN ${projectsTable} p ON ec.project_uuid = p.uuid
          WHERE p.user_id = ${users.id}
            AND ec.is_public = true
            AND ec.is_active = true
        ),
        0
      ) DESC`)
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      success: true,
      users: publicUsersWithCounts.map(user => ({
        id: user.id,
        username: user.username,
        name: user.name,
        image: user.image,
        avatar_url: user.avatar_url,
        bio: user.bio,
        assistant_count: user.assistant_count || 0,
      })),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (error) {
    console.error('Error fetching public users:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch public users' },
      { status: 500 }
    );
  }
}