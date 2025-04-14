import { and, eq } from 'drizzle-orm';
import { type NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { sharedMcpServersTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ profileId: string; serverId: string }> }
): Promise<NextResponse> {
  try {
    const session = await getAuthSession();
    const { profileId, serverId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!profileId || !serverId) {
      return NextResponse.json(
        { error: 'Profile ID and Server ID are required' },
        { status: 400 }
      );
    }

    // Delete the shared server
    const [deletedServer] = await db.delete(sharedMcpServersTable)
      .where(
        and(
          eq(sharedMcpServersTable.profile_uuid, profileId),
          eq(sharedMcpServersTable.uuid, serverId)
        )
      )
      .returning();

    if (!deletedServer) {
      return NextResponse.json(
        { error: 'Server not found or you do not have permission to delete it' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting shared server:', error);
    return NextResponse.json(
      { error: 'Failed to delete shared server' },
      { status: 500 }
    );
  }
}