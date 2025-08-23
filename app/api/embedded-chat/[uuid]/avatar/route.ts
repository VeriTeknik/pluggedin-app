import { and,eq } from 'drizzle-orm';
import { mkdir, writeFile } from 'fs/promises';
import { NextResponse } from 'next/server';
import { join } from 'path';
import sharp from 'sharp';

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
    const preCropped = formData.get('preCropped') === 'true';
    
    if (!file) {
      return new NextResponse('No file uploaded', { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return new NextResponse('File must be an image', { status: 400 });
    }

    // Maximum allowed size is 10MB
    if (file.size > 10 * 1024 * 1024) {
      return new NextResponse('File size must be less than 10MB', { status: 400 });
    }

    // Convert File to Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let processedImage: Buffer;
    
    if (preCropped) {
      // Image is already cropped by the client, just optimize it
      processedImage = await sharp(buffer)
        .resize(256, 256, {
          fit: 'cover',
          position: 'center',
          withoutEnlargement: true // Don't enlarge if already smaller
        })
        .jpeg({ quality: 90 })
        .toBuffer();
    } else {
      // Process and resize the image using sharp
      // Resize to 256x256, convert to JPEG for consistency and smaller file size
      processedImage = await sharp(buffer)
        .resize(256, 256, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 90 })
        .toBuffer();
    }

    // Create unique filename with .jpg extension
    const filename = `bot-${uuid}-${Date.now()}.jpg`;
    
    // Use BOT_AVATAR_PATH from environment or fallback to default
    const botAvatarPath = process.env.BOT_AVATAR_PATH || join(process.cwd(), 'public', 'avatars', 'bots');
    
    const path = join(botAvatarPath, filename);
    
    // Ensure bots avatars directory exists
    const botsAvatarsDir = botAvatarPath;
    try {
      await mkdir(botsAvatarsDir, { recursive: true });
    } catch (_error) {
      // Directory might already exist
    }

    // Write processed file
    await writeFile(path, processedImage);

    // Update embedded chat's bot avatar in database
    // Use API route for dynamic serving to avoid standalone build issues
    const imageUrl = `/api/avatars/bots/${filename}`;
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