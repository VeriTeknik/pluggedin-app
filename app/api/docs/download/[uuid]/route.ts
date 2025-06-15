import { readFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';

import { getDocByUuid } from '@/app/actions/docs';
import { getAuthSession } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    // Check authentication
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Extract uuid from params and profileUuid from query
    const { uuid } = await params;
    const { searchParams } = new URL(request.url);
    const profileUuid = searchParams.get('profileUuid');

    // Get the document using the authenticated user's ID and profile UUID
    // This ensures users can only access documents within their own workspace
    const doc = await getDocByUuid(session.user.id, uuid, profileUuid || undefined);
    if (!doc) {
      return new NextResponse('Document not found', { status: 404 });
    }

    // Read the file
    const filePath = join(process.cwd(), 'uploads', doc.file_path);
    try {
      const fileBuffer = await readFile(filePath);
      
      // Set appropriate headers
      const headers = new Headers();
      headers.set('Content-Type', doc.mime_type);
      headers.set('Content-Disposition', `attachment; filename="${doc.file_name}"`);
      headers.set('Content-Length', doc.file_size.toString());

      return new NextResponse(fileBuffer, {
        status: 200,
        headers,
      });
    } catch (fileError) {
      console.error('File read error:', fileError);
      return new NextResponse('File not found on disk', { status: 404 });
    }
  } catch (error) {
    console.error('Download error:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 