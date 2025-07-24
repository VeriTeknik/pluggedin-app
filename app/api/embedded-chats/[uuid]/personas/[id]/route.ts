import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/db/db';
import { 
  embeddedChatsTable, 
  projectsTable, 
  chatPersonasTable 
} from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

// Schema for updating persona
const UpdatePersonaSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.string().max(100).optional().nullable(),
  instructions: z.string().min(1).optional(),
  avatar_url: z.string().url().optional().nullable(),
  contact_email: z.string().email().optional().nullable(),
  contact_phone: z.string().optional().nullable(),
  contact_calendar_link: z.string().url().optional().nullable(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
  display_order: z.number().int().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: { uuid: string; id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const validatedData = UpdatePersonaSchema.parse(body);
    const personaId = parseInt(params.id);

    if (isNaN(personaId)) {
      return NextResponse.json({ error: 'Invalid persona ID' }, { status: 400 });
    }

    // Verify ownership
    const ownership = await db
      .select()
      .from(embeddedChatsTable)
      .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .where(and(
        eq(embeddedChatsTable.uuid, params.uuid),
        eq(projectsTable.user_id, session.user.id)
      ))
      .limit(1);

    if (ownership.length === 0) {
      return NextResponse.json({ error: 'Embedded chat not found' }, { status: 404 });
    }

    // If setting as default, unset other defaults
    if (validatedData.is_default) {
      await db
        .update(chatPersonasTable)
        .set({ is_default: false })
        .where(eq(chatPersonasTable.embedded_chat_uuid, params.uuid));
    }

    // Update persona
    const [updated] = await db
      .update(chatPersonasTable)
      .set({
        ...validatedData,
        updated_at: new Date(),
      })
      .where(and(
        eq(chatPersonasTable.id, personaId),
        eq(chatPersonasTable.embedded_chat_uuid, params.uuid)
      ))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error updating persona:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { uuid: string; id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const personaId = parseInt(params.id);
    if (isNaN(personaId)) {
      return NextResponse.json({ error: 'Invalid persona ID' }, { status: 400 });
    }

    // Verify ownership
    const ownership = await db
      .select()
      .from(embeddedChatsTable)
      .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .where(and(
        eq(embeddedChatsTable.uuid, params.uuid),
        eq(projectsTable.user_id, session.user.id)
      ))
      .limit(1);

    if (ownership.length === 0) {
      return NextResponse.json({ error: 'Embedded chat not found' }, { status: 404 });
    }

    // Delete persona
    await db
      .delete(chatPersonasTable)
      .where(and(
        eq(chatPersonasTable.id, personaId),
        eq(chatPersonasTable.embedded_chat_uuid, params.uuid)
      ));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting persona:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}