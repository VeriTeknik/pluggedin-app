import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { chatConversationsTable } from '@/db/schema';
import { eq } from 'drizzle-orm';

import { extractApiKey } from '@/lib/api-key';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const { uuid } = await params;
    
    // Extract API key and validate request
    const apiKey = extractApiKey(req);
    const origin = req.headers.get('origin') || req.headers.get('referer');
    const host = req.headers.get('host');
    const isInternalRequest = !origin || (origin && new URL(origin).hostname === host?.split(':')[0]);
    
    const { customPrompt, conversationId } = await req.json();

    if (!customPrompt || typeof customPrompt !== 'string') {
      return NextResponse.json(
        { error: 'Valid custom prompt required' },
        { status: 400 }
      );
    }

    // Store custom prompt in conversation metadata
    if (conversationId) {
      await db
        .update(chatConversationsTable)
        .set({
          metadata: {
            custom_system_prompt: customPrompt,
            updated_at: new Date().toISOString(),
          }
        })
        .where(eq(chatConversationsTable.uuid, conversationId));
    }

    return NextResponse.json({
      success: true,
      message: 'Custom prompt saved for conversation'
    });

  } catch (error) {
    console.error('Custom prompt error:', error);
    return NextResponse.json(
      { error: 'Failed to save custom prompt' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const { uuid } = await params;
    const url = new URL(req.url);
    const conversationId = url.searchParams.get('conversationId');

    if (!conversationId) {
      return NextResponse.json(
        { error: 'Conversation ID required' },
        { status: 400 }
      );
    }

    // Get custom prompt from conversation metadata
    const [conversation] = await db
      .select()
      .from(chatConversationsTable)
      .where(eq(chatConversationsTable.uuid, conversationId))
      .limit(1);

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    const metadata = conversation.metadata as any;
    const customPrompt = metadata?.custom_system_prompt || '';

    return NextResponse.json({
      success: true,
      customPrompt
    });

  } catch (error) {
    console.error('Get custom prompt error:', error);
    return NextResponse.json(
      { error: 'Failed to get custom prompt' },
      { status: 500 }
    );
  }
}