import { NextRequest, NextResponse } from 'next/server';

/**
 * Debug endpoint to see what MCP Inspector is sending
 */
export async function POST(request: NextRequest) {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  
  const body = await request.json();
  
  console.log('=== MCP Debug Request ===');
  console.log('Headers:', JSON.stringify(headers, null, 2));
  console.log('Body:', JSON.stringify(body, null, 2));
  console.log('=========================');
  
  // Return a mock initialize response
  if (body.method === 'initialize') {
    return NextResponse.json({
      jsonrpc: '2.0',
      result: {
        protocolVersion: '1.0.0',
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false, subscribe: false },
          prompts: { listChanged: false },
          logging: {}
        },
        serverInfo: {
          name: 'debug-server',
          version: '1.0.0'
        }
      },
      id: body.id
    });
  }
  
  return NextResponse.json({
    jsonrpc: '2.0',
    result: {
      debug: true,
      headers,
      body
    },
    id: body.id
  });
}

export async function GET(request: NextRequest) {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  
  console.log('=== MCP Debug GET Request ===');
  console.log('Headers:', JSON.stringify(headers, null, 2));
  console.log('==============================');
  
  // Return SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('event: open\ndata: {"type":"debug-connected"}\n\n'));
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}