import { NextRequest, NextResponse } from 'next/server';

import { getUploadStatus, updateDocRagId } from '@/app/actions/docs';
import { getAuthSession } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  try {
    // Check authentication
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Extract uploadId from params
    const { uploadId } = await params;
    
    // Get ragIdentifier and docUuid from query params
    const { searchParams } = new URL(request.url);
    const ragIdentifier = searchParams.get('ragIdentifier');
    const docUuid = searchParams.get('docUuid');
    
    if (!ragIdentifier) {
      return new NextResponse('Missing ragIdentifier parameter', { status: 400 });
    }

    // Call the server action
    const result = await getUploadStatus(uploadId, ragIdentifier);

    // If upload is completed and we have a document_id, update the doc record
    if (result.success && 
        result.status?.progress?.status === 'completed' && 
        result.status?.progress?.document_id && 
        docUuid) {
      
      const updateResult = await updateDocRagId(
        docUuid,
        result.status.progress.document_id,
        session.user.id
      );
      
      if (!updateResult.success) {
        console.error(`Failed to update document with RAG ID: ${updateResult.error}`);
      }
    }

    return NextResponse.json(
      result.success 
        ? { success: true, progress: result.status?.progress }
        : result
    );
  } catch (error) {
    console.error('Upload status API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
} 