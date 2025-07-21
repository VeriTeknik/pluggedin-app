import { readFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { join, normalize, resolve } from 'path';

import { getDocByUuid } from '@/app/actions/library';
import { authenticateApiKey } from '@/app/api/auth';
import { ErrorResponses } from '@/lib/api-errors';
import { getAuthSession } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    // Check authentication - support both session and API key
    let userId: string;
    let authenticatedProjectUuid: string | undefined;
    
    // First try API key authentication
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const apiKeyResult = await authenticateApiKey(request);
      if (apiKeyResult.error) {
        // If API key auth fails, try session auth
        const session = await getAuthSession();
        if (!session?.user?.id) {
          return ErrorResponses.unauthorized();
        }
        userId = session.user.id;
      } else {
        userId = apiKeyResult.user.id;
        authenticatedProjectUuid = apiKeyResult.activeProfile.project_uuid;
      }
    } else {
      // No API key, try session auth
      const session = await getAuthSession();
      if (!session?.user?.id) {
        return ErrorResponses.unauthorized();
      }
      userId = session.user.id;
    }

    // Extract uuid from params and projectUuid from query
    const { uuid } = await params;
    const { searchParams } = new URL(request.url);
    const projectUuid = searchParams.get('projectUuid') || authenticatedProjectUuid;

    // Get the document using the authenticated user's ID and project UUID
    // This ensures users can only access documents within their own project
    console.log('[Download] Attempting to get document:', {
      userId,
      uuid,
      projectUuid,
      authenticatedProjectUuid
    });
    
    const doc = await getDocByUuid(userId, uuid, projectUuid || undefined);
    
    console.log('[Download] Document result:', doc ? 'Found' : 'Not found');
    
    if (!doc) {
      return ErrorResponses.notFound();
    }

    // Sanitize and validate the file path
    let requestedPath: string;
    let uploadsRoot: string;
    
    // Check if running in local development (macOS)
    if (process.platform === 'darwin') {
      // Local development - use the full path as stored in DB
      requestedPath = resolve(normalize(doc.file_path));
      // For local dev, we need to determine the uploads root from the path itself
      // Assuming paths contain '/uploads/' directory
      const uploadsIndex = requestedPath.indexOf('/uploads/');
      if (uploadsIndex === -1) {
        console.error('Invalid file path - missing uploads directory:', doc.file_path);
        return ErrorResponses.forbidden();
      }
      uploadsRoot = requestedPath.substring(0, uploadsIndex + '/uploads'.length);
    } else {
      // Production/staging - use uploads directory
      uploadsRoot = resolve(process.env.UPLOADS_DIR || '/home/pluggedin/uploads');
      requestedPath = resolve(join(uploadsRoot, doc.file_path));
    }
    
    // Security check: ensure the resolved path is within the uploads directory
    // This handles all forms of directory traversal including encoded sequences
    if (!requestedPath.startsWith(uploadsRoot)) {
      console.error('Path traversal attempt detected:', {
        requested: requestedPath,
        root: uploadsRoot,
        original: doc.file_path
      });
      return ErrorResponses.forbidden();
    }
    
    // Read the file
    try {
      const fileBuffer = await readFile(requestedPath);
      
      // Set appropriate headers
      const headers = new Headers();
      headers.set('Content-Type', doc.mime_type);
      
      // Use RFC 2231 encoding for filename to safely handle all characters
      // This is the most secure approach and handles international characters properly
      headers.set('Content-Disposition', 
        `attachment; filename*=UTF-8''${encodeURIComponent(doc.file_name)}`);
      headers.set('Content-Length', doc.file_size.toString());

      return new NextResponse(fileBuffer, {
        status: 200,
        headers,
      });
    } catch (fileError) {
      console.error('File read error:', fileError);
      return ErrorResponses.notFound();
    }
  } catch (error) {
    console.error('Download error:', error);
    return ErrorResponses.serverError();
  }
} 