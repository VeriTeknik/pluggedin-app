import { NextRequest, NextResponse } from 'next/server';

import { ragService } from '@/lib/rag-service';
import { getAuthSession } from '@/lib/auth';
import { authenticateApiKey } from '@/app/api/auth';
import { ErrorResponses } from '@/lib/api-errors';

export async function GET(request: NextRequest) {
  try {
    // Check authentication - support both session and API key
    let authenticatedUserId: string;

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
        authenticatedUserId = session.user.id;
      } else {
        authenticatedUserId = apiKeyResult.user.id;
      }
    } else {
      // No API key, try session auth
      const session = await getAuthSession();
      if (!session?.user?.id) {
        return ErrorResponses.unauthorized();
      }
      authenticatedUserId = session.user.id;
    }

    const {searchParams} = request.nextUrl;
    const requestedUserId = searchParams.get('user_id');

    if (!requestedUserId) {
      return NextResponse.json(
        { error: 'user_id parameter is required' },
        { status: 400 }
      );
    }

    // CRITICAL: Verify that the authenticated user can only access their own stats
    if (requestedUserId !== authenticatedUserId) {
      return ErrorResponses.forbidden();
    }

    const userId = authenticatedUserId; // Use authenticated user ID

    // Delegate to RAG service which handles backend calls and fallbacks
    const storageStats = await ragService.getStorageStats(userId);

    if (!storageStats.success) {
      return NextResponse.json(
        { error: storageStats.error || 'Failed to fetch storage statistics' },
        { status: 500 }
      );
    }

    // Transform to API response format
    return NextResponse.json({
      documents_count: storageStats.documentsCount,
      total_chunks: storageStats.totalChunks,
      estimated_storage_mb: storageStats.estimatedStorageMb,
      vectors_count: storageStats.vectorsCount,
      embedding_dimension: storageStats.embeddingDimension,
      is_estimate: storageStats.isEstimate,
    });
  } catch (error) {
    console.error('Error fetching RAG storage stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch storage statistics' },
      { status: 500 }
    );
  }
}