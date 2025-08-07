import { and,eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { embeddedChatsTable, projectsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

// Schema for updating embedded chat
const UpdateEmbeddedChatSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  enabled_mcp_server_uuids: z.array(z.string().uuid()).optional(),
  enable_rag: z.boolean().optional(),
  allowed_domains: z.array(z.string()).optional(),
  contact_routing: z.record(z.any()).optional(),
  custom_instructions: z.string().optional(),
  welcome_message: z.string().optional(),
  suggested_questions: z.array(z.string()).optional(),
  theme_config: z.record(z.any()).optional(),
  position: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']).optional(),
  model_config: z.object({
    provider: z.enum(['openai', 'anthropic', 'google', 'xai']),
    model: z.string(),
    temperature: z.number().min(0).max(2),
    max_tokens: z.number().min(1).max(4000),
    top_p: z.number().min(0).max(1),
    frequency_penalty: z.number().min(0).max(2),
    presence_penalty: z.number().min(0).max(2),
  }).optional(),
  human_oversight: z.object({
    enabled: z.boolean(),
    mode: z.enum(['monitor', 'assist', 'takeover']),
    notification_channels: z.array(z.enum(['app', 'email'])),
    auto_assign: z.boolean(),
    business_hours: z.any().nullable(),
  }).optional(),
  context_window_size: z.number().min(1).max(50).optional(),
  max_conversation_length: z.number().min(10).max(500).optional(),
  offline_config: z.object({
    enabled: z.boolean(),
    message: z.string(),
    email_notification: z.boolean(),
    capture_contact: z.boolean(),
  }).optional(),
  is_public: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uuid } = await params;

    // Get embedded chat with project info
    const result = await db
      .select()
      .from(embeddedChatsTable)
      .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .where(and(
        eq(embeddedChatsTable.uuid, uuid),
        eq(projectsTable.user_id, session.user.id)
      ))
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json({ error: 'Embedded chat not found' }, { status: 404 });
    }

    return NextResponse.json(result[0].embedded_chats);
  } catch (error) {
    console.error('Error getting embedded chat:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uuid } = await params;
    const body = await req.json();
    const validatedData = UpdateEmbeddedChatSchema.parse(body);

    // Verify ownership
    const ownership = await db
      .select()
      .from(embeddedChatsTable)
      .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .where(and(
        eq(embeddedChatsTable.uuid, uuid),
        eq(projectsTable.user_id, session.user.id)
      ))
      .limit(1);

    if (ownership.length === 0) {
      return NextResponse.json({ error: 'Embedded chat not found' }, { status: 404 });
    }

    // Update embedded chat
    const [updated] = await db
      .update(embeddedChatsTable)
      .set({
        ...validatedData,
        updated_at: new Date(),
      })
      .where(eq(embeddedChatsTable.uuid, uuid))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error updating embedded chat:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uuid } = await params;

    // Verify ownership
    const ownership = await db
      .select()
      .from(embeddedChatsTable)
      .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .where(and(
        eq(embeddedChatsTable.uuid, uuid),
        eq(projectsTable.user_id, session.user.id)
      ))
      .limit(1);

    if (ownership.length === 0) {
      return NextResponse.json({ error: 'Embedded chat not found' }, { status: 404 });
    }

    // Delete embedded chat (cascade will handle related records)
    await db
      .delete(embeddedChatsTable)
      .where(eq(embeddedChatsTable.uuid, uuid));

    // Update project to disable embedded chat
    await db
      .update(projectsTable)
      .set({
        embedded_chat_enabled: false,
        embedded_chat_uuid: null,
      })
      .where(eq(projectsTable.uuid, ownership[0].projects.uuid));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting embedded chat:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}