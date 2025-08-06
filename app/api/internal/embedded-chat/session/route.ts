import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateEmbeddedChatSession } from '@/app/actions/mcp-playground';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
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
  } catch (error) {
    console.error('Session creation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}