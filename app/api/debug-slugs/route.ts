import {eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { embeddedChatsTable, projectsTable, users } from '@/db/schema';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username') || 'cem';
  
  try {
    // Get user
    const user = await db.query.users.findFirst({
      where: eq(users.username, username),
    });
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' });
    }
    
    // Get all embedded chats for this user
    const results = await db
      .select({
        uuid: embeddedChatsTable.uuid,
        name: embeddedChatsTable.name,
        slug: embeddedChatsTable.slug,
        projectName: projectsTable.name,
        isPublic: embeddedChatsTable.is_public,
        isActive: embeddedChatsTable.is_active,
      })
      .from(embeddedChatsTable)
      .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .where(eq(projectsTable.user_id, user.id));
    
    return NextResponse.json({
      username,
      userId: user.id,
      chats: results,
    });
  } catch (error) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}