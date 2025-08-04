import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { db } from '@/db';
import { 
  embeddedChatsTable, 
  projectsTable, 
  chatPersonasTable 
} from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

// Schema for creating persona
const CreatePersonaSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.string().max(100).optional(),
  instructions: z.string().min(1),
  avatar_url: z.string().url().optional(),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().optional(),
  contact_calendar_link: z.string().url().optional(),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
  display_order: z.number().int().default(0),
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

    // Get personas
    const personas = await db
      .select()
      .from(chatPersonasTable)
      .where(eq(chatPersonasTable.embedded_chat_uuid, uuid))
      .orderBy(chatPersonasTable.display_order);

    return NextResponse.json(personas);
  } catch (error) {
    console.error('Error getting personas:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
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
    const validatedData = CreatePersonaSchema.parse(body);

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

    // If this is set as default, unset other defaults
    if (validatedData.is_default) {
      await db
        .update(chatPersonasTable)
        .set({ is_default: false })
        .where(eq(chatPersonasTable.embedded_chat_uuid, uuid));
    }

    // Create persona
    const [persona] = await db
      .insert(chatPersonasTable)
      .values({
        embedded_chat_uuid: uuid,
        ...validatedData,
      })
      .returning();

    return NextResponse.json(persona);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error creating persona:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}