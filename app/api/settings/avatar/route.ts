import { eq } from 'drizzle-orm';
import { mkdir, writeFile } from 'fs/promises';
import { NextResponse } from 'next/server';
import { join } from 'path';
import sharp from 'sharp';

import { db } from '@/db';
import { users } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
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
    const filename = `${session.user.id}-${Date.now()}.jpg`;
    const path = join(process.cwd(), 'public', 'avatars', filename);
    
    // Ensure avatars directory exists
    const avatarsDir = join(process.cwd(), 'public', 'avatars');
    try {
      await mkdir(avatarsDir, { recursive: true });
    } catch (_error) {
      // Directory might already exist
    }

    // Write processed file
    await writeFile(path, processedImage);

    // Update user's image in database
    const imageUrl = `/avatars/${filename}`;
    await db
      .update(users)
      .set({ 
        image: imageUrl,
        updated_at: new Date()
      })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ 
      message: 'Avatar updated successfully',
      image: imageUrl
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
