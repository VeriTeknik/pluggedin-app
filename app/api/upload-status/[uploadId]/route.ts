import { NextRequest, NextResponse } from 'next/server';

import { getUploadStatus } from '@/app/actions/docs';
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
    
    // Get ragIdentifier from query params
    const { searchParams } = new URL(request.url);
    const ragIdentifier = searchParams.get('ragIdentifier');
    
    if (!ragIdentifier) {
      return new NextResponse('Missing ragIdentifier parameter', { status: 400 });
    }

    // Call the server action
    const result = await getUploadStatus(uploadId, ragIdentifier);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Upload status API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
} 