import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { chatConversationsTable } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

// Schema for heartbeat request
const HeartbeatSchema = z.object({
  conversation_id: z.string().uuid(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const { uuid } = await params;
    
    // Parse request body
    const body = await req.json();
    const validatedData = HeartbeatSchema.parse(body);
    
    // Update heartbeat timestamp
    const result = await db
      .update(chatConversationsTable)
      .set({
        last_heartbeat: new Date(),
        updated_at: new Date(),
      })
      .where(and(
        eq(chatConversationsTable.uuid, validatedData.conversation_id),
        eq(chatConversationsTable.embedded_chat_uuid, uuid),
        eq(chatConversationsTable.status, 'active')
      ));
    
    // Add CORS headers for embedded widget
    const origin = req.headers.get('origin') || req.headers.get('referer');
    const response = NextResponse.json({ 
      success: true,
      message: 'Heartbeat updated'
    });
    
    if (origin) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    }
    
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error updating heartbeat:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') || req.headers.get('referer');
  const response = new NextResponse(null, { status: 200 });
  
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  
  return response;
}