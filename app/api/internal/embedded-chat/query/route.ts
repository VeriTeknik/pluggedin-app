import { NextRequest, NextResponse } from 'next/server';

import { executeEmbeddedChatQuery } from '@/app/actions/mcp-playground';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chatUuid, conversationId, query, enableRag } = body;
    
    if (!chatUuid || !conversationId || !query) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }
    
    const result = await executeEmbeddedChatQuery(
      chatUuid,
      conversationId,
      query,
      enableRag
    );
    
    console.log('[EMBEDDED QUERY] Result:', {
      success: result.success,
      hasStreamingResponses: !!result.streamingResponses,
      streamingResponsesCount: result.streamingResponses?.length || 0,
      hasMessages: !!result.messages,
      messagesCount: result.messages?.length || 0,
      error: result.error
    });
    
    // For streaming, we need to convert the result into a streaming response
    if (result.success && result.streamingResponses) {
      // Create a readable stream
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // Send the streaming responses
            for (const response of result.streamingResponses) {
              const chunk = JSON.stringify(response);
              controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
              
              // Add a small delay to simulate streaming
              await new Promise(resolve => setTimeout(resolve, 10));
            }
            
            // Send final result
            const finalData = {
              type: 'final',
              messages: result.messages,
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalData)}\n\n`));
            
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        }
      });
      
      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Query execution error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}