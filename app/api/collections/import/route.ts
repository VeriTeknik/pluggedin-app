import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getSharedCollection } from '@/app/actions/social';
import { db } from '@/db';
import { McpServerSource, mcpServersTable, McpServerStatus, McpServerType, projectsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';
import { encryptServerData } from '@/lib/encryption';
import {
  validateCommand,
  validateCommandArgs,
  validateHeaders,
  validateImportedCommand,
  validateMcpUrl,
} from '@/lib/security/validators';

/**
 * @swagger
 * /api/collections/import:
 *   post:
 *     summary: Import servers from a shared collection
 *     description: Imports the MCP server configurations defined within a specified shared collection into the authenticated user's current active profile. If a server with the same name already exists in the profile, it is skipped. Requires user session authentication. Note The global API key security definition does not apply here; this endpoint uses session cookies.
 *     tags:
 *       - Collections
 *       - MCP Servers
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - collectionUuid
 *             properties:
 *               collectionUuid:
 *                 type: string
 *                 format: uuid
 *                 description: The UUID of the shared collection to import servers from.
 *               importType:
 *                 type: string
 *                 enum: [current, new]
 *                 description: Specifies where to import the servers (currently only 'current' profile is implemented, 'new' might create a new profile/workspace in the future).
 *                 default: current
 *     responses:
 *       200:
 *         description: Collection imported successfully. Returns a list of newly created server records.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Collection imported successfully
 *                 servers:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/McpServer' # Assuming McpServer schema is defined
 *       400:
 *         description: Bad Request - Collection UUID is missing in the request body.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Collection UUID is required
 *       401:
 *         description: Unauthorized - User session is invalid or missing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Unauthorized
 *       404:
 *         description: Not Found - The specified collection UUID does not exist or is not shared.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Collection not found
 *       500:
 *         description: Internal Server Error - Failed to import the collection.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to import collection
 */

/**
 * Why a shared server must not be imported, or null if it is acceptable.
 *
 * The same allowlist createMcpServer enforces: the type must bring the field it
 * needs, the command must be one of the permitted binaries, the arguments must
 * be free of shell metacharacters, and the URL must not point inside the
 * network.
 */
function rejectUnsafeServer(serverConfig: any): string | null {
  const type = serverConfig?.type || McpServerType.STDIO;

  if (type === McpServerType.SSE || type === McpServerType.STREAMABLE_HTTP) {
    if (!serverConfig?.url) {
      return 'no URL for an SSE or Streamable HTTP server';
    }
    const urlValidation = validateMcpUrl(serverConfig.url);
    if (!urlValidation.valid) {
      return urlValidation.error ?? 'invalid URL';
    }
  } else if (type === McpServerType.STDIO) {
    if (!serverConfig?.command) {
      return 'no command for a STDIO server';
    }
    const commandValidation = validateCommand(serverConfig.command);
    if (!commandValidation.valid) {
      return commandValidation.error ?? 'invalid command';
    }
  } else {
    return `unsupported server type: ${String(type)}`;
  }

  // A non-array `args` used to skip validation entirely and be written as-is.
  if (serverConfig?.args !== undefined && serverConfig.args !== null) {
    if (!Array.isArray(serverConfig.args)) {
      return 'arguments must be a list';
    }
    const argsValidation = validateCommandArgs(serverConfig.args);
    if (!argsValidation.valid) {
      return argsValidation.error ?? 'invalid arguments';
    }
  }

  // `node` and `python` are on the allowlist because running your own server is
  // the point of the product. A definition that arrives inside somebody else's
  // collection is not your own, and an interpreter handed inline code there is
  // arbitrary code execution as the importer.
  const importedCommand = validateImportedCommand(serverConfig?.command, serverConfig?.args);
  if (!importedCommand.valid) {
    return importedCommand.error ?? 'command not allowed for an imported server';
  }

  // Arrays and other truthy non-objects survive validateHeaders' Object.entries
  // walk, and the unsanitized original was the value persisted.
  if (serverConfig?.headers !== undefined && serverConfig.headers !== null) {
    if (typeof serverConfig.headers !== 'object' || Array.isArray(serverConfig.headers)) {
      return 'headers must be an object';
    }
    const headerValidation = validateHeaders(serverConfig.headers);
    if (!headerValidation.valid) {
      return headerValidation.error ?? 'invalid headers';
    }
  }

  return null;
}

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

    // Get the user's active project and profile
    const project = await db.query.projectsTable.findFirst({
      where: eq(projectsTable.user_id, session.user.id),
      with: {
        profiles: {
          columns: { uuid: true },
          limit: 1
        }
      }
    });

    if (!project || !project.profiles || project.profiles.length === 0) {
      return NextResponse.json({ error: 'No active profile found' }, { status: 400 });
    }

    const profileUuid = project.active_profile_uuid || project.profiles[0].uuid;

    // Handle importType
    if (importType === 'new') {
      return Response.json(
        { error: 'Creating new workspace on import is not yet implemented' },
        { status: 501 }
      );
    }

    // Import each server from the collection
    const importedServers = [];
    // `content` is { servers: [...] } — the shape the share dialog writes and
    // the collection page reads. Iterating the object itself yielded a single
    // entry named "servers" whose value was the array, so every import created
    // one bogus server and no real ones.
    const sharedServers: any[] = Array.isArray((collection.content as any)?.servers)
      ? (collection.content as any).servers
      : [];

    for (const serverConfig of sharedServers) {
      const serverName = (serverConfig as any)?.name;
      if (!serverName) {
        continue;
      }

      // A collection is public and anyone can publish one, so this content is
      // attacker-controlled and these rows land with status ACTIVE. #214's
      // sanitizer redacts credentials but says nothing about what may run, so
      // the same checks createMcpServer applies are applied here.
      const rejection = rejectUnsafeServer(serverConfig);
      if (rejection) {
        console.warn(`Skipping server '${serverName}' from collection ${collectionUuid}: ${rejection}`);
        continue;
      }

      // Check if server already exists in this profile
      const existingServer = await db.query.mcpServersTable.findFirst({
        where: and(
          eq(mcpServersTable.name, serverName),
          eq(mcpServersTable.profile_uuid, profileUuid)
        )
      });

      if (!existingServer) {
        // Prepare server data
        const serverData = {
          name: serverName,
          description: (serverConfig as any).description || '',
          type: (serverConfig as any).type || McpServerType.STDIO,
          command: (serverConfig as any).command || null,
          args: (serverConfig as any).args || [],
          env: (serverConfig as any).env || {},
          url: (serverConfig as any).url || null,
          oauth_token: (serverConfig as any).oauth_token || null,
          headers: (serverConfig as any).headers || null,
          session_id: (serverConfig as any).session_id || null,
          profile_uuid: profileUuid,
          status: McpServerStatus.ACTIVE,
          source: McpServerSource.PLUGGEDIN,
          external_id: (serverConfig as any).external_id || null,
          notes: (serverConfig as any).notes || '',
        };

        // Encrypt sensitive fields before insertion
        const encryptedData = encryptServerData(serverData);

        // Create new server
        const newServer = await db.insert(mcpServersTable).values(encryptedData).returning();
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
