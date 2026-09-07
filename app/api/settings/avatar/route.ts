import { eq } from 'drizzle-orm';
import { mkdir, writeFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import sharp from 'sharp';

import { db } from '@/db';
import { users } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';
import { validateCSRF } from '@/lib/csrf-protection';

export async function POST(req: NextRequest) {
  try {
    // Validate CSRF for this state-changing operation
    const csrfError = await validateCSRF(req);
    if (csrfError) return csrfError;

    const session = await getAuthSession();
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
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

    // Never serve the uploaded bytes or a client-selected extension. Decode a
    // bounded raster and re-encode it without metadata on our own origin.
    let buffer: Buffer;
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      const image = sharp(bytes, { limitInputPixels: 16_000_000, animated: false });
      const metadata = await image.metadata();
      // Sharp reports AVIF's container as heif, not avif.
      if (!['jpeg', 'png', 'webp', 'gif', 'heif'].includes(metadata.format || '')) {
        return new NextResponse('File must be a raster image', { status: 400 });
      }
      buffer = await image.rotate().resize(512, 512, { fit: 'inside', withoutEnlargement: true }).webp().toBuffer();
    } catch {
      return new NextResponse('Invalid image', { status: 400 });
    }
    const filename = `${session.user.id}-${Date.now()}.webp`;
    const path = join(process.cwd(), 'public', 'avatars', filename);

    // Ensure avatars directory exists
    const avatarsDir = join(process.cwd(), 'public', 'avatars');
    try {
      await writeFile(join(avatarsDir, '.gitkeep'), '');
    } catch (_error) {
      // Create directory if it doesn't exist
      await mkdir(avatarsDir, { recursive: true });
    }

    // Write file
    await writeFile(path, buffer);

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
