import { getAuthSession } from '@/lib/auth';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';

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
    } catch (error) {
      // Create directory if it doesn't exist
      const { mkdir } = require('fs/promises');
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
