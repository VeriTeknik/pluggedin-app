import { NextRequest, NextResponse } from 'next/server';

import { endEmbeddedChatSession } from '@/app/actions/mcp-playground';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chatUuid } = body;
    
    if (!chatUuid) {
      return NextResponse.json(
        { error: 'Missing chatUuid' },
        { status: 400 }
      );
    }
    
    const result = await endEmbeddedChatSession(chatUuid);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Session end error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}