import { eq, and } from 'drizzle-orm';
import { mkdir, writeFile } from 'fs/promises';
import { NextResponse } from 'next/server';
import { join } from 'path';

import { db } from '@/db';
import { embeddedChatsTable, projectsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { uuid } = await params;

    // Verify ownership of the embedded chat
    const [chatWithProject] = await db
      .select({
        chat: embeddedChatsTable,
        project: projectsTable,
      })
      .from(embeddedChatsTable)
      .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .where(and(
        eq(embeddedChatsTable.uuid, uuid),
        eq(projectsTable.user_id, session.user.id)
      ))
      .limit(1);

    if (!chatWithProject) {
      return new NextResponse('Chat not found or unauthorized', { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get('avatar') as File;
    
    if (!file) {
      return new NextResponse('No file uploaded', { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return new NextResponse('File must be an image', { status: 400 });
    }

    // Validate file size (1MB)
    if (file.size > 1024 * 1024) {
      return new NextResponse('File size must be less than 1MB', { status: 400 });
    }

    // Create unique filename
    const ext = file.name.split('.').pop();
    const filename = `bot-${uuid}-${Date.now()}.${ext}`;
    const path = join(process.cwd(), 'public', 'avatars', 'bots', filename);
    
    // Convert File to Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Ensure bots avatars directory exists
    const botsAvatarsDir = join(process.cwd(), 'public', 'avatars', 'bots');
    try {
      await mkdir(botsAvatarsDir, { recursive: true });
    } catch (_error) {
      // Directory might already exist
    }

    // Write file
    await writeFile(path, buffer);

    // Update embedded chat's bot avatar in database
    const imageUrl = `/avatars/bots/${filename}`;
    await db
      .update(embeddedChatsTable)
      .set({ 
        bot_avatar_url: imageUrl,
        updated_at: new Date()
      })
      .where(eq(embeddedChatsTable.uuid, uuid));

    return NextResponse.json({ 
      message: 'Bot avatar updated successfully',
      image: imageUrl
    });
  } catch (error) {
    console.error('Bot avatar upload error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}