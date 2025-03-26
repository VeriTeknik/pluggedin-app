import { eq } from 'drizzle-orm';
import { mkdir, writeFile } from 'fs/promises';
import { NextResponse } from 'next/server';
import { join } from 'path';

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
    const filename = `${session.user.id}-${Date.now()}.${ext}`;
    const path = join(process.cwd(), 'public', 'avatars', filename);
    
    // Convert File to Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

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
