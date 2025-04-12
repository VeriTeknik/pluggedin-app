import { db } from '@/db';
import { McpServerSource, McpServerStatus, McpServerType, mcpServersTable } from '@/db/schema';
import { getSharedCollection } from '@/app/actions/social';
import { getAuthSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { collectionUuid, importType } = body;

    if (!collectionUuid) {
      return NextResponse.json({ error: 'Collection UUID is required' }, { status: 400 });
    }

    const collection = await getSharedCollection(collectionUuid);
    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    // TODO: Handle importType === 'new' by creating a new workspace
    // For now, we'll just import to the current workspace

    // Import each server from the collection
    const importedServers = [];
    for (const [serverName, serverConfig] of Object.entries(collection.content)) {
      // Check if server already exists
      const existingServer = await db.query.mcpServersTable.findFirst({
        where: eq(mcpServersTable.name, serverName)
      });

      if (!existingServer) {
        // Create new server
        const newServer = await db.insert(mcpServersTable).values({
          name: serverName,
          description: (serverConfig as any).description || '',
          type: McpServerType.STDIO,
          command: (serverConfig as any).command || '',
          args: (serverConfig as any).args || [],
          env: (serverConfig as any).env || {},
          url: (serverConfig as any).url || '',
          profile_uuid: session.user.id,
          status: McpServerStatus.ACTIVE,
          source: McpServerSource.PLUGGEDIN,
          external_id: (serverConfig as any).external_id || null,
          notes: (serverConfig as any).notes || '',
        }).returning();
        importedServers.push(newServer[0]);
      }
    }

    return NextResponse.json({
      message: 'Collection imported successfully',
      servers: importedServers
    });
  } catch (error) {
    console.error('Error importing collection:', error);
    return NextResponse.json(
      { error: 'Failed to import collection' },
      { status: 500 }
    );
  }
} 