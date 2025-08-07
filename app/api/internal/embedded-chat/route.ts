import { NextRequest, NextResponse } from 'next/server';

import { 
  endEmbeddedChatSession,
  executeEmbeddedChatQuery,
  getOrCreateEmbeddedChatSession} from '@/app/actions/mcp-playground';

// Internal API that can be called from other API routes
// This bridges the gap between API routes and server actions

export async function POST(req: NextRequest) {
  try {
    const { pathname } = new URL(req.url);
    const body = await req.json();
    
    // Route to appropriate handler based on path
    if (pathname.endsWith('/session')) {
      // Initialize embedded chat session
      const { chatUuid, profileUuid, enabledServerUuids, modelConfig } = body;
      
      if (!chatUuid || !profileUuid) {
        return NextResponse.json(
          { error: 'Missing required parameters' },
          { status: 400 }
        );
      }
      
      const result = await getOrCreateEmbeddedChatSession(
        chatUuid,
        profileUuid,
        enabledServerUuids || [],
        modelConfig
      );
      
      return NextResponse.json(result);
      
    } else if (pathname.endsWith('/query')) {
      // Execute a query
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
      
      // For streaming, we need to convert the result into a streaming response
      if (result.success && result.streamingResponses) {
        // Create a readable stream
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            try {
              // Send the streaming responses
              for (const response of result.streamingResponses) {
                const chunk = JSON.stringify(response) + '\n';
                controller.enqueue(encoder.encode(`data: ${chunk}\n`));
              }
              
              // Send final result
              const finalData = {
                type: 'final',
                messages: result.messages,
                result: result.result
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
      
    } else if (pathname.endsWith('/end')) {
      // End session
      const { chatUuid } = body;
      
      if (!chatUuid) {
        return NextResponse.json(
          { error: 'Missing chatUuid' },
          { status: 400 }
        );
      }
      
      const result = await endEmbeddedChatSession(chatUuid);
      return NextResponse.json(result);
    }
    
    return NextResponse.json(
      { error: 'Invalid endpoint' },
      { status: 404 }
    );
    
  } catch (error) {
    console.error('Internal API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// Support different operations via query params or path
export async function GET(req: NextRequest) {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}