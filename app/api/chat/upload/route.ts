import { mkdir, writeFile } from 'fs/promises';
import { nanoid } from 'nanoid';
import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';

import { extractApiKey } from '@/lib/api-key';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'chat');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'text/plain',
  'text/markdown',
  'application/json',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
];

// Ensure upload directory exists
async function ensureUploadDir() {
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

export async function POST(req: NextRequest) {
  try {
    // Check API key if provided
    const apiKey = extractApiKey(req);
    const origin = req.headers.get('origin') || req.headers.get('referer');
    const host = req.headers.get('host');
    const isInternalRequest = !origin || (origin && new URL(origin).hostname === host?.split(':')[0]);
    
    // For external requests, require API key validation
    if (!isInternalRequest && !apiKey) {
      return NextResponse.json(
        { error: 'API key required for file uploads' },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const chatUuid = formData.get('chatUuid') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!chatUuid) {
      return NextResponse.json(
        { error: 'Chat UUID required' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `File type ${file.type} not allowed` },
        { status: 400 }
      );
    }

    await ensureUploadDir();

    // Generate unique filename
    const fileId = nanoid();
    const extension = file.name.split('.').pop() || '';
    const fileName = `${fileId}.${extension}`;
    const filePath = join(UPLOAD_DIR, fileName);

    // Convert file to buffer and save
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Return file info
    const fileInfo = {
      id: fileId,
      name: file.name,
      type: file.type,
      size: file.size,
      url: `/api/chat/upload/${fileId}`, // URL to retrieve the file
      uploaded_at: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      file: fileInfo,
    });

  } catch (error) {
    console.error('File upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}

// Handle file retrieval
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const fileId = url.pathname.split('/').pop();

    if (!fileId) {
      return NextResponse.json(
        { error: 'File ID required' },
        { status: 400 }
      );
    }

    // For security, we'd typically validate the fileId format and check permissions
    // This is a simplified implementation
    
    return NextResponse.json({
      success: false,
      error: 'File retrieval not implemented yet'
    });

  } catch (error) {
    console.error('File retrieval error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve file' },
      { status: 500 }
    );
  }
}