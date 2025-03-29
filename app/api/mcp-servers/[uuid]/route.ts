import { NextResponse } from 'next/server';
import { db } from '@/db';
import { mcpServersTable } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getAuthSession } from '@/lib/auth';
import { z } from 'zod';

// Define schema for PATCH request body
const updateServerSchema = z.object({
  notes: z.string().nullable().optional(), // Allow notes to be updated or cleared
  // Add other updatable fields here if needed in the future
  // e.g., name: z.string().optional(),
  //       status: z.nativeEnum(McpServerStatus).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { uuid: string } }
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const serverUuid = params.uuid;

  try {
    const body = await request.json();
    const parseResult = updateServerSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parseResult.error.flatten() }, { status: 400 });
    }

    const { notes } = parseResult.data;

    // 1. Authorize: Verify the user owns the server via project/profile
    // We need to join through profiles and projects to check user_id
    const server = await db.query.mcpServersTable.findFirst({
      columns: { uuid: true }, // Only need uuid for verification
      where: eq(mcpServersTable.uuid, serverUuid),
      with: {
        profile: {
          columns: { uuid: true },
          with: {
            project: {
              columns: { user_id: true },
            },
          },
        },
      },
    });

    if (!server || server.profile?.project?.user_id !== userId) {
      return NextResponse.json({ error: 'Server not found or unauthorized' }, { status: 404 });
    }

    // 2. Update the server notes
    const [updatedServer] = await db
      .update(mcpServersTable)
      .set({
        notes: notes, // Update notes (can be null to clear)
        // Add other fields here if they become updatable
      })
      .where(eq(mcpServersTable.uuid, serverUuid))
      .returning(); // Return the updated record

    if (!updatedServer) {
       // Should not happen if authorization check passed, but good practice
       return NextResponse.json({ error: 'Failed to update server, server not found after authorization.' }, { status: 404 });
    }

    console.log(`Updated notes for server ${serverUuid}`);
    return NextResponse.json(updatedServer);

  } catch (error: any) {
    console.error(`Error updating server ${serverUuid}:`, error);
    return NextResponse.json({ error: 'Failed to update server', details: error.message }, { status: 500 });
  }
}

// TODO: Implement DELETE handler if needed
// export async function DELETE(...) { ... }
