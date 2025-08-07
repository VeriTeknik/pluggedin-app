import { and,eq } from 'drizzle-orm';
import { mkdir, writeFile } from 'fs/promises';
import { NextResponse } from 'next/server';
import { join } from 'path';
import sharp from 'sharp';

import { db } from '@/db';
import { chatPersonasTable, embeddedChatsTable, projectsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ uuid: string; personaId: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { uuid, personaId } = await params;

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

    // Verify the persona belongs to this chat
    const [persona] = await db
      .select()
      .from(chatPersonasTable)
      .where(and(
        eq(chatPersonasTable.id, parseInt(personaId)),
        eq(chatPersonasTable.embedded_chat_uuid, uuid)
      ))
      .limit(1);

    if (!persona) {
      return new NextResponse('Persona not found', { status: 404 });
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
      processedImage = await sharp(buffer)
        .resize(256, 256, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 90 })
        .toBuffer();
    }

    // Create unique filename with .jpg extension
    const filename = `persona-${personaId}-${Date.now()}.jpg`;
    const path = join(process.cwd(), 'public', 'avatars', 'personas', filename);
    
    // Ensure personas avatars directory exists
    const personasAvatarsDir = join(process.cwd(), 'public', 'avatars', 'personas');
    try {
      await mkdir(personasAvatarsDir, { recursive: true });
    } catch (_error) {
      // Directory might already exist
    }

    // Write processed file
    await writeFile(path, processedImage);

    // Update persona's avatar in database
    const imageUrl = `/avatars/personas/${filename}`;
    await db
      .update(chatPersonasTable)
      .set({ 
        avatar_url: imageUrl,
        updated_at: new Date()
      })
      .where(eq(chatPersonasTable.id, parseInt(personaId)));

    return NextResponse.json({ 
      message: 'Persona avatar updated successfully',
      image: imageUrl
    });
  } catch (error) {
    console.error('Persona avatar upload error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}