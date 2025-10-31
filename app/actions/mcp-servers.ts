'use server';

import { and, desc, eq, isNull, like, not, or } from 'drizzle-orm';

import { db } from '@/db';
import { 
  customInstructionsTable, 
  McpServerSource, 
  mcpServersTable, 
  McpServerStatus, 
  McpServerType, 
  profilesTable, 
  projectsTable,
  serverInstallationsTable,
  users 
} from '@/db/schema';
import { auditLog, AuditLogActions,AuditLogTypes } from '@/lib/audit-logger';
import { withProfileAuth } from '@/lib/auth-helpers';
import { decryptServerData, encryptServerData } from '@/lib/encryption';
import { validateCommand, validateCommandArgs, validateHeaders, validateMcpUrl } from '@/lib/security/validators';
import { formatRateLimitError,rateLimitServerAction, ServerActionRateLimits } from '@/lib/server-action-rate-limiter';
import { McpServerSlugService } from '@/lib/services/mcp-server-slug-service';
import { 
  createMcpServerSchema, 
  generateSlugSchema} from '@/lib/validation/mcp-server-schemas';
import type { McpServer } from '@/types/mcp-server';

import { discoverSingleServerTools } from './discover-mcp-tools';
import { getServerRatingMetrics, trackServerInstallation } from './mcp-server-metrics';

type ServerWithUsername = {
  server: typeof mcpServersTable.$inferSelect;
  username: string | null;
}

type ServerWithMetrics = typeof mcpServersTable.$inferSelect & {
  username: string | null;
  averageRating?: number;
  ratingCount?: number;
  installationCount?: number;
}

/**
 * Apply rate limiting to an action
 * @throws Error if rate limit is exceeded
 */
async function applyRateLimit(
  userId: string,
  action: string,
  config = ServerActionRateLimits.serverModification
): Promise<void> {
  const rateLimitResult = await rateLimitServerAction(userId, action, config);
  
  if (!rateLimitResult.allowed) {
    throw new Error(formatRateLimitError(rateLimitResult));
  }
}

export async function getMcpServers(profileUuid: string): Promise<ServerWithMetrics[]> {
  return withProfileAuth(profileUuid, async (session) => {
    const userId = session.user.id;

    // Apply rate limiting for read operations
    await applyRateLimit(userId, 'get-servers', ServerActionRateLimits.serverRead);

    // Get the servers without type assertion
    const serversQuery = await db
    .select({
      server: mcpServersTable,
      username: users.username
    })
    .from(mcpServersTable)
    .leftJoin(profilesTable, eq(mcpServersTable.profile_uuid, profilesTable.uuid))
    .leftJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
    .leftJoin(users, eq(projectsTable.user_id, users.id))
    .where(
      and(
        eq(mcpServersTable.profile_uuid, profileUuid),
        or(
          eq(mcpServersTable.status, McpServerStatus.ACTIVE),
          eq(mcpServersTable.status, McpServerStatus.INACTIVE)
        ),
        // Exclude temporary servers created during discovery tests
        // Handle NULL descriptions properly - NULL descriptions should be included
        or(
          isNull(mcpServersTable.description),
          not(like(mcpServersTable.description, 'Temporary % server for discovery test'))
        )
      )
    )
    .orderBy(desc(mcpServersTable.created_at));
  
  
  // Debug: Log all servers before filtering to understand what's being excluded
  // const allServersDebug = await db
  //   .select({
  //     server: mcpServersTable,
  //   })
  //   .from(mcpServersTable)
  //   .where(eq(mcpServersTable.profile_uuid, profileUuid));

  // Type the result correctly
  const servers: ServerWithUsername[] = serversQuery;

  // Fetch ratings and installation metrics for each server
  const serversWithMetrics = await Promise.all(
    servers.map(async ({ server, username }) => {
      try {
        // Decrypt sensitive fields
        const decryptedServer = decryptServerData(server);
        
        const metrics = await getServerRatingMetrics({
          source: server.source || McpServerSource.PLUGGEDIN,
          externalId: server.external_id || server.uuid
        });

        return {
          ...decryptedServer,
          username,
          averageRating: metrics?.metrics?.averageRating,
          ratingCount: metrics?.metrics?.ratingCount,
          installationCount: metrics?.metrics?.installationCount
        };
      } catch (error) {
        console.error(`Error getting metrics for server ${server.uuid}:`, error);
        return {
          ...server,
          username,
          averageRating: undefined,
          ratingCount: undefined,
          installationCount: undefined
        };
      }
    })
  );

    return serversWithMetrics;
  });
}

export async function getMcpServerByUuid(
  profileUuid: string,
  uuid: string
): Promise<McpServer | undefined> {
  return withProfileAuth(profileUuid, async (session) => {
    const userId = session.user.id;

    // Apply rate limiting for read operations
    await applyRateLimit(userId, 'get-server', ServerActionRateLimits.serverRead);

    const server = await db.query.mcpServersTable.findFirst({
      where: and(
        eq(mcpServersTable.uuid, uuid),
        eq(mcpServersTable.profile_uuid, profileUuid)
      ),
    });

    if (!server) return undefined;

    // Decrypt sensitive fields
    const decryptedServer = decryptServerData(server);

    return {
      ...decryptedServer,
      config: decryptedServer.config as Record<string, any> | null,
      transport: decryptedServer.transport as 'streamable_http' | 'sse' | 'stdio' | undefined
    } as McpServer;
  });
}

export async function deleteMcpServerByUuid(
  profileUuid: string,
  uuid: string
): Promise<void> {
  return withProfileAuth(profileUuid, async (session) => {
    const userId = session.user.id;

    // Apply rate limiting for modification operations
    await applyRateLimit(userId, 'delete-server', ServerActionRateLimits.serverModification);

    // Get server details before deletion for tracking
  const server = await db.query.mcpServersTable.findFirst({
    where: and(
      eq(mcpServersTable.uuid, uuid),
      eq(mcpServersTable.profile_uuid, profileUuid)
    ),
  });

  if (server) {
    // TODO: Track uninstallation to new analytics service when available

    // Remove from local installations table
    if (server.external_id && server.source) {
      await db.delete(serverInstallationsTable)
        .where(
          and(
            eq(serverInstallationsTable.server_uuid, uuid),
            eq(serverInstallationsTable.profile_uuid, profileUuid)
          )
        ).catch(error => {
          console.error('Failed to remove installation record:', error);
        });
    }
  }

  // Delete related activity records first to avoid foreign key constraint violation
  try {
    const { mcpActivityTable } = await import('@/db/schema');
    await db
      .delete(mcpActivityTable)
      .where(eq(mcpActivityTable.server_uuid, uuid));
  } catch (error) {
    console.error('Failed to delete activity records:', error);
    // Continue with server deletion even if activity cleanup fails
  }

  // Delete the server
  await db
    .delete(mcpServersTable)
    .where(
      and(
        eq(mcpServersTable.uuid, uuid),
        eq(mcpServersTable.profile_uuid, profileUuid)
      )
    );

  // Audit log the successful deletion
  await auditLog({
    profileUuid,
    type: AuditLogTypes.SERVER_DELETE,
    action: AuditLogActions.DELETE,
    serverUuid: uuid,
    userId,
    metadata: {
      serverName: server?.name || 'Unknown',
      status: 'success'
    }
    });
  });
}

export async function toggleMcpServerStatus(
  profileUuid: string,
  uuid: string,
  newStatus: McpServerStatus
): Promise<void> {
  await db
    .update(mcpServersTable)
    .set({ status: newStatus })
    .where(
      and(
        eq(mcpServersTable.uuid, uuid),
        eq(mcpServersTable.profile_uuid, profileUuid)
      )
    );
}

export async function updateMcpServer(
  profileUuid: string,
  uuid: string,
  data: {
    name?: string;
    description?: string | null;
    command?: string | null; // Allow null
    args?: string[];
    env?: { [key: string]: string };
    url?: string | null; // Allow null
    type?: McpServerType;
    notes?: string | null;
    transport?: 'streamable_http' | 'sse' | 'stdio';
    streamableHTTPOptions?: {
      sessionId?: string;
      headers?: Record<string, string>;
    };
  }
): Promise<{ success: boolean; error?: string }> {
  return withProfileAuth(profileUuid, async (session) => {
    const userId = session.user.id;

    try {
      // Apply rate limiting for modification operations
      await applyRateLimit(userId, 'update-server', ServerActionRateLimits.serverModification);
    
    // Audit log the update attempt
    await auditLog({
      profileUuid,
      type: AuditLogTypes.SERVER_UPDATE,
      action: AuditLogActions.UPDATE,
      serverUuid: uuid,
      userId,
      metadata: { fieldsUpdated: Object.keys(data) },
    });
    
    // Validate slug if it's being updated
    if (data.name !== undefined) {
      const slugValidation = generateSlugSchema.safeParse({
        name: data.name,
        profileUuid: profileUuid,
        excludeUuid: uuid
      });
      
      if (!slugValidation.success) {
        throw new Error('Invalid server name provided');
      }
    }
    
    // Only validate if we're updating type-specific fields
    let serverType: McpServerType | undefined = data.type;
  
  // If type is not being updated but we need to validate type-specific fields, get current server type
  if (!serverType && (data.url !== undefined || data.command !== undefined || data.streamableHTTPOptions !== undefined)) {
    const currentServer = await getMcpServerByUuid(profileUuid, uuid);
    if (currentServer) {
      serverType = currentServer.type;
    }
  }
  
  // Validate URL for SSE and StreamableHTTP servers
  if (serverType && (serverType === McpServerType.SSE || serverType === McpServerType.STREAMABLE_HTTP) && data.url && data.url !== null) {
    const urlValidation = validateMcpUrl(data.url);
    if (!urlValidation.valid) {
      throw new Error(urlValidation.error);
    }
  }
  
  // Validate STDIO command if updating
  if (serverType && serverType === McpServerType.STDIO && data.command && data.command !== null) {
    const commandValidation = validateCommand(data.command);
    if (!commandValidation.valid) {
      throw new Error(commandValidation.error);
    }
  }
  
  // Validate command arguments if updating
  if (data.args && data.args.length > 0) {
    const argsValidation = validateCommandArgs(data.args);
    if (!argsValidation.valid) {
      throw new Error(argsValidation.error);
    }
  }
  
  // Validate headers for StreamableHTTP
  if (serverType && serverType === McpServerType.STREAMABLE_HTTP && data.streamableHTTPOptions?.headers) {
    const headerValidation = validateHeaders(data.streamableHTTPOptions.headers);
    if (!headerValidation.valid) {
      throw new Error(headerValidation.error);
    }
    // Use sanitized headers
    data.streamableHTTPOptions.headers = headerValidation.sanitizedHeaders;
  }
  // Construct the update object carefully to handle undefined vs null
  const updateData: Partial<typeof mcpServersTable.$inferInsert> = {};
  
  // Non-sensitive fields can be updated directly
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.type !== undefined) updateData.type = data.type;
  if (data.notes !== undefined) updateData.notes = data.notes;
  
  // Handle sensitive fields that need encryption
  const sensitiveData: any = {};
  if (data.command !== undefined) sensitiveData.command = data.command;
  if (data.args !== undefined) sensitiveData.args = data.args;
  if (data.env !== undefined) sensitiveData.env = data.env;
  if (data.url !== undefined) sensitiveData.url = data.url;
  
  // Handle transport-specific options separately
  if (data.transport !== undefined) sensitiveData.transport = data.transport;
  if (data.streamableHTTPOptions !== undefined) sensitiveData.streamableHTTPOptions = data.streamableHTTPOptions;
  
  // If we have sensitive data to update, encrypt it
  if (Object.keys(sensitiveData).length > 0) {
    const encryptedData = encryptServerData(sensitiveData);
    Object.assign(updateData, encryptedData);
    
    // Always set the unencrypted fields to null when we have encrypted versions
    updateData.command = null;
    updateData.args = null;
    updateData.env = null;
    updateData.url = null;
    // Note: transport and streamableHTTPOptions don't exist as direct columns in the database
    // They are stored in encrypted columns only
  }

  if (Object.keys(updateData).length === 0) {
    console.warn("updateMcpServer called with no fields to update.");
    return { success: true }; // No fields to update, but still successful
  }


  // Use transaction to ensure atomicity between server update and slug generation
  await db.transaction(async (tx) => {
    // Update the server data
    await tx
      .update(mcpServersTable)
      .set(updateData)
      .where(
        and(
          eq(mcpServersTable.uuid, uuid),
          eq(mcpServersTable.profile_uuid, profileUuid)
        )
      );

    // Regenerate slug if name was updated (within same transaction)
    if (data.name !== undefined) {
      await McpServerSlugService.generateAndSetSlug(
        uuid, 
        data.name, 
        profileUuid, 
        uuid, // excludeUuid for updates
        tx
      );
    }
  });

  // Trigger discovery after update
  try {
    // Don't await this, let it run in the background
    discoverSingleServerTools(profileUuid, uuid).catch(discoveryError => {
       console.error('[Action Warning] Background tool discovery failed after update for server:', { uuid, error: discoveryError });
    });
  } catch (error) {
    // Catch synchronous errors if discoverSingleServerTools itself throws immediately (unlikely for async)
    console.error('[Action Warning] Failed to trigger tool discovery after update for server:', { uuid, error });
    // Do not re-throw, allow the update operation to be considered successful
  }

  // Revalidate path if needed
  // revalidatePath('/mcp-servers');
  
  return { success: true };
    } catch (error) {
      console.error('[updateMcpServer] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update MCP server'
      };
    }
  });
}

export async function createMcpServer({
  name,
  profileUuid,
  description,
  command,
  args,
  env,
  type,
  url,
  source,
  external_id,
  transport,
  streamableHTTPOptions,
  skipDiscovery = false,
  config,
}: {
  name: string;
  profileUuid: string;
  description?: string;
  command?: string;
  args?: string[];
  env?: { [key: string]: string };
  type?: McpServerType;
  url?: string;
  source?: McpServerSource;
  external_id?: string;
  transport?: 'streamable_http' | 'sse' | 'stdio';
  streamableHTTPOptions?: {
    sessionId?: string;
    headers?: Record<string, string>;
  };
  skipDiscovery?: boolean;
  config?: Record<string, any>;
}) { // Removed explicit return type to match actual returns
  return withProfileAuth(profileUuid, async (session) => {
    const userId = session.user.id;

    try {
      // Apply rate limiting for modification operations
      await applyRateLimit(userId, 'create-server', ServerActionRateLimits.serverModification);
    
    // Audit log the creation attempt
    await auditLog({
      profileUuid,
      type: AuditLogTypes.SERVER_CREATE,
      action: AuditLogActions.CREATE,
      userId,
      metadata: { serverName: name, serverType: type },
    });
    
    const serverType = type || McpServerType.STDIO;
    
    // Prepare data for Zod validation - include ALL user-provided fields
    const validationData = {
      name,
      type: serverType,
      ...(description !== undefined && { description }),
      ...(command !== undefined && { command }),
      ...(args !== undefined && { args }),
      ...(env !== undefined && { env_vars: env }),
      ...(url !== undefined && { server_url: url }),
      ...(streamableHTTPOptions?.headers && { headers: streamableHTTPOptions.headers }),
      ...(streamableHTTPOptions?.sessionId && { sessionId: streamableHTTPOptions.sessionId }),
      // Mass assignment fix: validate source and external_id
      ...(source !== undefined && { source }),
      ...(external_id !== undefined && { external_id }),
    };

    // Validate with Zod schema
    const validationResult = createMcpServerSchema.safeParse(validationData);
    if (!validationResult.success) {
      return {
        success: false,
        error: 'Invalid server configuration provided'
      };
    }

    // Additional security validations (keeping existing ones)
    if (serverType === McpServerType.STDIO && !command) {
      return { success: false, error: 'Command is required for STDIO servers' };
    }

    if ((serverType === McpServerType.SSE || serverType === McpServerType.STREAMABLE_HTTP) && !url) {
      return { success: false, error: 'URL is required for SSE and Streamable HTTP servers' };
    }

    // Validate URL for SSE and StreamableHTTP servers
    if ((serverType === McpServerType.SSE || serverType === McpServerType.STREAMABLE_HTTP) && url) {
      const urlValidation = validateMcpUrl(url);
      if (!urlValidation.valid) {
        return { success: false, error: urlValidation.error };
      }
    }

    // Validate STDIO command
    if (serverType === McpServerType.STDIO && command) {
      const commandValidation = validateCommand(command);
      if (!commandValidation.valid) {
        return { success: false, error: commandValidation.error };
      }
      
      // Validate command arguments
      if (args && args.length > 0) {
        const argsValidation = validateCommandArgs(args);
        if (!argsValidation.valid) {
          return { success: false, error: argsValidation.error };
        }
      }
    }

    // Validate headers for StreamableHTTP
    if (serverType === McpServerType.STREAMABLE_HTTP && streamableHTTPOptions?.headers) {
      const headerValidation = validateHeaders(streamableHTTPOptions.headers);
      if (!headerValidation.valid) {
        return { success: false, error: headerValidation.error };
      }
      // Use sanitized headers
      streamableHTTPOptions.headers = headerValidation.sanitizedHeaders;
    }

    // Prepare data for encryption
    const serverData = {
      name,
      description,
      type: serverType,
      command: serverType === McpServerType.STDIO ? command : null,
      args: args || [],
      env: env || {},
      url: (serverType === McpServerType.SSE || serverType === McpServerType.STREAMABLE_HTTP) ? url : null,
      profile_uuid: profileUuid,
      source,
      external_id,
      config: config || null,
      // Store transport-specific options separately
      transport: (serverType === McpServerType.STREAMABLE_HTTP) ? (transport || 'streamable_http') : undefined,
      streamableHTTPOptions: (serverType === McpServerType.STREAMABLE_HTTP && streamableHTTPOptions) ? streamableHTTPOptions : undefined,
    };
    
    // Encrypt sensitive fields
    const encryptedData = encryptServerData(serverData);
    
    // Use transaction to ensure atomicity between server creation and slug generation
    const newServer = await db.transaction(async (tx) => {
      // Insert the server record
      const inserted = await tx.insert(mcpServersTable).values(encryptedData).returning();
      const server = inserted[0];

      if (!server || !server.uuid) {
         throw new Error("Failed to retrieve new server details after insertion.");
      }

      // Generate and set slug for the new server (within same transaction)
      await McpServerSlugService.generateAndSetSlug(
        server.uuid,
        name, // Use the original server name
        profileUuid,
        undefined, // no excludeUuid for new servers
        tx
      );

      return server;
    });

    // Track server installation
    try {
      if (source) {
        await trackServerInstallation({
          profileUuid,
          serverUuid: newServer.uuid,
          externalId: external_id || '',
          source
        });
      }
    } catch (trackingError) {
      console.error('Error tracking installation:', trackingError);
      // Continue even if tracking fails
    }

    // Trigger discovery after creation (unless explicitly skipped)
    if (!skipDiscovery) {
      try {
        // Don't await this, let it run in the background
        discoverSingleServerTools(profileUuid, newServer.uuid).catch(discoveryError => {
           console.error(`[Action Warning] Background tool discovery failed after creation for server ${newServer.uuid}:`, discoveryError);
        });
      } catch (error) {
        // Catch synchronous errors if discoverSingleServerTools itself throws immediately (unlikely for async)
        console.error(`[Action Warning] Failed to trigger tool discovery after creation for server ${newServer.uuid}:`, error);
        // Do not re-throw, allow the creation operation to be considered successful
      }
    } else {
    }

    return { success: true, data: newServer }; // Return success and the new server data
    } catch (error) {
      console.error('Error creating MCP server:', error);
      return {
        success: false,
        error: `Failed to create MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  });
}

export async function bulkImportMcpServers(
  data: {
    mcpServers: {
      [name: string]: {
        command?: string;
        args?: string[];
        env?: { [key: string]: string };
        description?: string;
        url?: string;
        type?: McpServerType;
      };
    };
  },
  profileUuid?: string | null
) {
  if (!profileUuid) {
    throw new Error('Current workspace not found');
  }

  const { mcpServers } = data;

  const serverEntries = Object.entries(mcpServers);
  const createdServerUuids: string[] = []; // Keep track of created UUIDs

  for (const [name, serverConfig] of serverEntries) {
    const serverType = serverConfig.type || McpServerType.STDIO;
    
    // Validate URL for SSE and StreamableHTTP servers
    if ((serverType === McpServerType.SSE || serverType === McpServerType.STREAMABLE_HTTP) && serverConfig.url) {
      const urlValidation = validateMcpUrl(serverConfig.url);
      if (!urlValidation.valid) {
        console.error(`Skipping server '${name}': ${urlValidation.error}`);
        continue;
      }
    }
    
    // Validate STDIO command
    if (serverType === McpServerType.STDIO && serverConfig.command) {
      const commandValidation = validateCommand(serverConfig.command);
      if (!commandValidation.valid) {
        console.error(`Skipping server '${name}': ${commandValidation.error}`);
        continue;
      }
      
      // Validate command arguments
      if (serverConfig.args && serverConfig.args.length > 0) {
        const argsValidation = validateCommandArgs(serverConfig.args);
        if (!argsValidation.valid) {
          console.error(`Skipping server '${name}': ${argsValidation.error}`);
          continue;
        }
      }
    }
    
    const serverData = {
      name,
      description: serverConfig.description || '',
      command: serverConfig.command || null,
      args: serverConfig.args || [],
      env: serverConfig.env || {},
      url: serverConfig.url || null,
      type: serverType,
      profile_uuid: profileUuid,
      status: McpServerStatus.ACTIVE,
    };

    // Encrypt sensitive fields before insertion
    const encryptedData = encryptServerData(serverData);

    // Insert the server into the database
    const inserted = await db.insert(mcpServersTable).values(encryptedData).returning({ uuid: mcpServersTable.uuid });
    if (inserted[0]?.uuid) {
        createdServerUuids.push(inserted[0].uuid);

        // Generate slug for the newly created server
        try {
          await McpServerSlugService.generateAndSetSlug(
            inserted[0].uuid,
            name,
            profileUuid
          );
        } catch (slugError) {
          console.error(`Failed to generate slug for bulk imported server ${inserted[0].uuid}:`, slugError);
          // Continue without slug - server creation should still succeed
        }
    }
  }

  // Trigger discovery for all newly created servers in the background
  if (createdServerUuids.length > 0 && profileUuid) {
      // Fire off discovery tasks without awaiting each one individually
      createdServerUuids.forEach(uuid => {
          discoverSingleServerTools(profileUuid, uuid).catch(discoveryError => {
              console.error(`[Action Warning] Background tool discovery failed during bulk import for server ${uuid}:`, discoveryError);
          });
      });
  }

  return { success: true, count: serverEntries.length };
}

/**
 * Import a shared MCP server
 * @param profileUuid UUID of the profile to import the server to
 * @param serverData Server data to be imported
 * @param serverName Custom name for the imported server
 * @returns Success status and the imported server if successful
 */
export async function importSharedServer(
  profileUuid: string,
  serverData: McpServer | any,
  serverName: string
): Promise<{ success: boolean; server?: McpServer; error?: string }> {
  try {
    // Determine if we're using the original server or a sanitized template
    const isTemplate = serverData && !serverData.uuid;
    
    // Use the template values or the original server values with appropriate defaults
    const serverToImport = {
      name: serverName,
      description: serverData.description, // Ensure description is properly transferred
      type: serverData.type,
      command: serverData.command,
      args: serverData.args || [],
      // If it's a template, use the sanitized env, otherwise use empty object
      env: isTemplate && serverData.env ? serverData.env : {}, 
      url: serverData.url,
      profile_uuid: profileUuid,
      status: McpServerStatus.ACTIVE,
      source: serverData.source || McpServerSource.PLUGGEDIN,
      external_id: null, // Don't copy external ID to avoid conflicts
      notes: isTemplate
        ? `Imported from template shared by ${serverData.sharedBy || 'another user'} (original server ID: ${serverData.originalServerUuid || 'unknown'})`
        : `Imported from shared server originally created by ${serverData.profile_uuid}`,
    };

    // Encrypt sensitive fields before insertion
    const encryptedServerData = encryptServerData(serverToImport);

    // Create new server based on shared server data
    const [newServer] = await db.insert(mcpServersTable)
      .values(encryptedServerData)
      .returning();

    if (!newServer) {
      return {
        success: false,
        error: 'Failed to import server',
      };
    }
    
    // Import custom instructions if they exist in the shared server data
    if (serverData.customInstructions && (Array.isArray(serverData.customInstructions) || typeof serverData.customInstructions === 'string')) {
      try {
        // Handle both string and array formats for custom instructions
        const messages = typeof serverData.customInstructions === 'string' 
          ? [serverData.customInstructions] 
          : serverData.customInstructions;
        
        await db.insert(customInstructionsTable).values({
          mcp_server_uuid: newServer.uuid,
          description: 'Imported custom instructions',
          messages: messages,
        });
        
      } catch (error) {
        console.error('Error importing custom instructions:', error);
        // Continue without custom instructions if there's an error
      }
    }

    return {
      success: true,
      server: newServer as unknown as McpServer,
    };
  } catch (error) {
    console.error('Error importing shared server:', error);
    return {
      success: false,
      error: 'An error occurred while importing the server',
    };
  }
}

/**
 * Create a shareable template from an MCP server by removing sensitive information
 * but preserving structure with placeholders
 *  
 * @param server The original MCP server
 * @returns A sanitized version for sharing
 */
export async function createShareableTemplate(server: McpServer): Promise<any> {
  // Cast server to any to access encrypted fields
  const serverAny = server as any;
  
  // First, ensure we have decrypted data to work with
  let decryptedServer = server;
  
  // Check if server has encrypted fields and decrypt them if necessary
  if (serverAny.command_encrypted || serverAny.args_encrypted || serverAny.env_encrypted || serverAny.url_encrypted) {
    const { decryptServerData } = await import('@/lib/encryption');
    decryptedServer = decryptServerData(serverAny);
  }
  
  // Create template with basic server information (non-sensitive fields)
  const template: any = {
    uuid: decryptedServer.uuid,
    name: decryptedServer.name,
    description: decryptedServer.description,
    type: decryptedServer.type,
    source: decryptedServer.source,
    transport: (decryptedServer as any).transport,
    streamableHTTPOptions: (decryptedServer as any).streamableHTTPOptions,
    status: decryptedServer.status,
    created_at: decryptedServer.created_at,
    updated_at: (decryptedServer as any).updated_at,
    // Add the decrypted sensitive fields so they can be edited in the dialog
    command: decryptedServer.command,
    args: decryptedServer.args,
    env: decryptedServer.env,
    url: decryptedServer.url,
  };
  
  // Add metadata about the source server
  template.originalServerUuid = server.uuid;
  
  try {
    // Get profile information with user data
    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.uuid, server.profile_uuid),
      with: {
        project: {
          with: {
            user: {
              columns: {
                username: true,
                name: true
              }
            }
          }
        }
      }
    });
    
    if (profile?.project?.user) {
      template.sharedBy = profile.project.user.username || profile.project.user.name || server.profile_uuid;
    }
  } catch (error) {
    console.error("Error fetching profile information:", error);
    // If there's an error, continue without the sharedBy information
  }
  
  // Sanitize the database URL if present in command or args
  if (template.command) {
    template.command = sanitizeDatabaseUrl(template.command);
  }
  
  if (template.args && Array.isArray(template.args)) {
    template.args = template.args.map((arg: string) => sanitizeDatabaseUrl(arg));
  }

  // Replace sensitive env variables with placeholders
  const sanitizedEnv: Record<string, string> = {};
  if (template.env && typeof template.env === 'object') {
    Object.keys(template.env).forEach(key => {
      // Assume environment variables are sensitive and replace with placeholders
      if (key.toLowerCase().includes('key') || 
          key.toLowerCase().includes('token') || 
          key.toLowerCase().includes('secret') || 
          key.toLowerCase().includes('password') || 
          key.toLowerCase().includes('auth')) {
        sanitizedEnv[key] = '<YOUR_SECRET_HERE>';
      } else {
        // For non-sensitive keys, check if the value looks like a URL with credentials
        const value = template.env[key];
        if (typeof value === 'string') {
          sanitizedEnv[key] = sanitizeDatabaseUrl(value);
        } else {
          sanitizedEnv[key] = value;
        }
      }
    });
  }
  template.env = sanitizedEnv;
  
  // Clear any API keys or tokens in the URL
  if (template.url) {
    template.url = sanitizeDatabaseUrl(template.url);
  }
  
  // Fetch and include custom instructions if they exist
  try {
    const customInstructions = await db.query.customInstructionsTable.findFirst({
      where: eq(customInstructionsTable.mcp_server_uuid, server.uuid),
    });
    
    if (customInstructions) {
      template.customInstructions = customInstructions.messages;
    }
  } catch (error) {
    console.error("Error fetching custom instructions:", error);
    // Continue without custom instructions if there's an error
  }
  
  return template;
}

/**
 * Sanitize a database URL or any URL with credentials
 * Replaces usernames, passwords, API keys, etc. with placeholders
 * 
 * @param text The text that might contain sensitive URLs
 * @returns Sanitized text with credentials replaced by placeholders
 */
function sanitizeDatabaseUrl(text: string): string {
  if (!text) return text;
  
  // Replace postgres connections: postgresql://username:password@host:port/database
  text = text.replace(
    /(postgresql:\/\/[^:]+):([^@]+)@([^\/]+\/[^\s]+)/gi, 
    '$1:<YOUR_PASSWORD>@$3'
  );
  
  // Replace mongodb connections: mongodb://username:password@host:port/database
  text = text.replace(
    /(mongodb:\/\/[^:]+):([^@]+)@([^\/]+\/[^\s]+)/gi, 
    '$1:<YOUR_PASSWORD>@$3'
  );
  
  // Replace mysql connections: mysql://username:password@host:port/database
  text = text.replace(
    /(mysql:\/\/[^:]+):([^@]+)@([^\/]+\/[^\s]+)/gi, 
    '$1:<YOUR_PASSWORD>@$3'
  );
  
  // Replace URLs with API keys in them: https://api.example.com?api_key=abcd1234
  text = text.replace(
    /([\?&](?:api_key|access_token|token|key|auth|apikey)=)([^&\s]+)/gi,
    '$1<YOUR_API_KEY>'
  );
  
  // Replace any other URL with basic auth: https://username:password@example.com
  text = text.replace(
    /(https?:\/\/[^:]+):([^@]+)@/gi,
    '$1:<YOUR_PASSWORD>@'
  );
  
  return text;
}
