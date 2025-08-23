import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    
    // Validate filename to prevent path traversal
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return new NextResponse('Invalid filename', { status: 400 });
    }
    
    // Only allow .jpg files (as all bot avatars are converted to jpg)
    if (!filename.endsWith('.jpg')) {
      return new NextResponse('Invalid file type', { status: 400 });
    }
    
    // Use BOT_AVATAR_PATH from environment or fallback
    const botAvatarPath = process.env.BOT_AVATAR_PATH || join(process.cwd(), 'public', 'avatars', 'bots');
    const filePath = join(botAvatarPath, filename);
    
    // Check if file exists
    if (!existsSync(filePath)) {
      return new NextResponse('File not found', { status: 404 });
    }
    
    // Read the file
    const fileBuffer = await readFile(filePath);
    
    // Return the image with proper headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year since filenames are unique
      },
    });
  } catch (error) {
    console.error('Error serving bot avatar:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}