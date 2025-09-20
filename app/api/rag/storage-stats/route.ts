import { NextRequest, NextResponse } from 'next/server';

import { ragService } from '@/lib/rag-service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json(
        { error: 'user_id parameter is required' },
        { status: 400 }
      );
    }

    // For now, we'll proxy to the backend RAG server if available,
    // or return estimated stats based on document count
    const ragApiUrl = process.env.RAG_API_URL;

    if (ragApiUrl) {
      try {
        // Try to get from actual backend
        const backendResponse = await fetch(`${ragApiUrl}/rag/storage-stats?user_id=${userId}`, {
          method: 'GET',
          headers: {
            'accept': 'application/json',
          },
        });

        if (backendResponse.ok) {
          const data = await backendResponse.json();
          return NextResponse.json(data);
        }
      } catch (error) {
        console.log('Backend storage-stats not available, using fallback');
      }
    }

    // Fallback: estimate based on document count
    const docsResponse = await ragService.getDocuments(userId);

    if (docsResponse.success && docsResponse.documents) {
      const documentsCount = docsResponse.documents.length;
      const avgChunksPerDoc = 25;
      const avgBytesPerVector = 1536 * 4; // 1536 dimensions * 4 bytes per float32
      const totalChunks = documentsCount * avgChunksPerDoc;
      const estimatedStorageMb = (totalChunks * avgBytesPerVector) / (1024 * 1024);

      return NextResponse.json({
        documents_count: documentsCount,
        total_chunks: totalChunks,
        estimated_storage_mb: Math.round(estimatedStorageMb * 10) / 10,
        vectors_count: totalChunks,
        embedding_dimension: 1536,
        is_estimate: true, // Flag to indicate this is an estimate
      });
    }

    // No documents found
    return NextResponse.json({
      documents_count: 0,
      total_chunks: 0,
      estimated_storage_mb: 0,
      vectors_count: 0,
      embedding_dimension: 1536,
      is_estimate: true,
    });
  } catch (error) {
    console.error('Error fetching RAG storage stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch storage statistics' },
      { status: 500 }
    );
  }
}