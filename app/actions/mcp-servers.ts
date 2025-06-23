'use server';

import { and, desc, eq, or } from 'drizzle-orm';

import { db } from '@/db';
import { 
  customInstructionsTable, 
  McpServerSource, 
  mcpServersTable, 
  McpServerStatus, 
  McpServerType, 
  profilesTable, 
  projectsTable, 
  users 
} from '@/db/schema';
import { decryptServerData, encryptServerData } from '@/lib/encryption';
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

export async function getMcpServers(profileUuid: string): Promise<ServerWithMetrics[]> {
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
        )
      )
    )
    .orderBy(desc(mcpServersTable.created_at));

  // Type the result correctly
  const servers: ServerWithUsername[] = serversQuery;

  // Fetch ratings and installation metrics for each server
  const serversWithMetrics = await Promise.all(
    servers.map(async ({ server, username }) => {
      try {
        // Decrypt sensitive fields
        const decryptedServer = decryptServerData(server, profileUuid);
        
        // Extract streamable HTTP options from env if present
        const processedServer: any = { ...decryptedServer };
        if (server.type === McpServerType.STREAMABLE_HTTP && decryptedServer.env) {
          const { __transport, __streamableHTTPOptions, ...cleanEnv } = decryptedServer.env;
          
          processedServer.env = cleanEnv;
          if (__transport) {
            processedServer.transport = __transport;
          }
          if (__streamableHTTPOptions) {
            try {
              processedServer.streamableHTTPOptions = JSON.parse(__streamableHTTPOptions);
            } catch (e) {
              console.error('Failed to parse streamableHTTPOptions:', e);
            }
          }
        }
        
        const metrics = await getServerRatingMetrics({
          source: server.source || McpServerSource.PLUGGEDIN,
          externalId: server.external_id || server.uuid
        });

        return {
          ...processedServer,
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
}

export async function getMcpServerByUuid(
  profileUuid: string,
  uuid: string
): Promise<McpServer | undefined> {
  const server = await db.query.mcpServersTable.findFirst({
      where: and(
        eq(mcpServersTable.uuid, uuid),
        eq(mcpServersTable.profile_uuid, profileUuid)
      ),
    });
    
  if (!server) return undefined;
  
  // Decrypt sensitive fields
  const decryptedServer = decryptServerData(server, profileUuid);
  
  // Extract streamable HTTP options from env if present
  if (server.type === McpServerType.STREAMABLE_HTTP && decryptedServer.env) {
    const { __transport, __streamableHTTPOptions, ...cleanEnv } = decryptedServer.env;
    
    const processedServer: any = {
      ...decryptedServer,
      env: cleanEnv
    };
    
    if (__transport) {
      processedServer.transport = __transport;
    }
    if (__streamableHTTPOptions) {
      try {
        processedServer.streamableHTTPOptions = JSON.parse(__streamableHTTPOptions);
      } catch (e) {
        console.error('Failed to parse streamableHTTPOptions:', e);
      }
    }
    
    return processedServer;
  }
  
  return decryptedServer;
}

export async function deleteMcpServerByUuid(
  profileUuid: string,
  uuid: string
): Promise<void> {
  await db
    .delete(mcpServersTable)
    .where(
      and(
        eq(mcpServersTable.uuid, uuid),
        eq(mcpServersTable.profile_uuid, profileUuid)
      )
    );
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
): Promise<void> { // Changed return type to void as it doesn't explicitly return the server
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
  if (data.env !== undefined || data.streamableHTTPOptions !== undefined) {
    // Merge env with streamable HTTP options if present
    sensitiveData.env = {
      ...(data.env || {}),
      ...(data.type === McpServerType.STREAMABLE_HTTP && data.streamableHTTPOptions ? {
        __transport: data.transport || 'streamable_http',
        __streamableHTTPOptions: JSON.stringify(data.streamableHTTPOptions),
      } : {}),
    };
  }
  if (data.url !== undefined) sensitiveData.url = data.url;
  
  // If we have sensitive data to update, encrypt it
  if (Object.keys(sensitiveData).length > 0) {
    const encryptedData = encryptServerData(sensitiveData, profileUuid);
    Object.assign(updateData, encryptedData);
    
    // Always set the unencrypted fields to null when we have encrypted versions
    updateData.command = null;
    updateData.args = null;
    updateData.env = null;
    updateData.url = null;
  }

  if (Object.keys(updateData).length === 0) {
    console.warn("updateMcpServer called with no fields to update.");
    return; // No fields to update
  }

  await db
    .update(mcpServersTable)
    .set(updateData)
    .where(
      and(
        eq(mcpServersTable.uuid, uuid),
        eq(mcpServersTable.profile_uuid, profileUuid)
      )
    );

  // Trigger discovery after update
  try {
    console.log(`[Action] Triggering tool discovery for updated server: ${uuid}`);
    // Don't await this, let it run in the background
    discoverSingleServerTools(profileUuid, uuid).catch(discoveryError => {
       console.error(`[Action Warning] Background tool discovery failed after update for server ${uuid}:`, discoveryError);
    });
  } catch (error) {
    // Catch synchronous errors if discoverSingleServerTools itself throws immediately (unlikely for async)
    console.error(`[Action Warning] Failed to trigger tool discovery after update for server ${uuid}:`, error);
    // Do not re-throw, allow the update operation to be considered successful
  }

  // Revalidate path if needed
  // revalidatePath('/mcp-servers');
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
}) { // Removed explicit return type to match actual returns
  try {
    const serverType = type || McpServerType.STDIO;

    // Validate inputs based on type
    if (serverType === McpServerType.STDIO && !command) {
      return { success: false, error: 'Command is required for STDIO servers' };
    }

    if ((serverType === McpServerType.SSE || serverType === McpServerType.STREAMABLE_HTTP) && !url) {
      return { success: false, error: 'URL is required for SSE and Streamable HTTP servers' };
    }

    const urlIsValid = url ? /^https?:\/\/.+/.test(url) : false;
    if ((serverType === McpServerType.SSE || serverType === McpServerType.STREAMABLE_HTTP) && !urlIsValid) {
      return { success: false, error: 'URL must be a valid HTTP/HTTPS URL' };
    }

    // Prepare data for encryption
    const serverData = {
      name,
      description,
      type: serverType,
      command: serverType === McpServerType.STDIO ? command : null,
      args: args || [],
      env: {
        ...(env || {}),
        // Store streamable HTTP options in env for now
        ...(serverType === McpServerType.STREAMABLE_HTTP && streamableHTTPOptions ? {
          __transport: transport || 'streamable_http',
          __streamableHTTPOptions: JSON.stringify(streamableHTTPOptions),
        } : {}),
      },
      url: (serverType === McpServerType.SSE || serverType === McpServerType.STREAMABLE_HTTP) ? url : null,
      profile_uuid: profileUuid,
      source,
      external_id,
    };
    
    // Encrypt sensitive fields
    const encryptedData = encryptServerData(serverData, profileUuid);
    
    // Insert and get the newly created server record
    const inserted = await db.insert(mcpServersTable).values(encryptedData).returning(); // Use returning() to get the inserted row

    const newServer = inserted[0]; // Get the first (and only) inserted row

    if (!newServer || !newServer.uuid) {
       throw new Error("Failed to retrieve new server details after insertion.");
    }

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

    // Trigger discovery after creation
    try {
      console.log(`[Action] Triggering tool discovery for created server: ${newServer.uuid}`);
      // Don't await this, let it run in the background
      discoverSingleServerTools(profileUuid, newServer.uuid).catch(discoveryError => {
         console.error(`[Action Warning] Background tool discovery failed after creation for server ${newServer.uuid}:`, discoveryError);
      });
    } catch (error) {
      // Catch synchronous errors if discoverSingleServerTools itself throws immediately (unlikely for async)
      console.error(`[Action Warning] Failed to trigger tool discovery after creation for server ${newServer.uuid}:`, error);
      // Do not re-throw, allow the creation operation to be considered successful
    }

    return { success: true, data: newServer }; // Return success and the new server data
  } catch (error) {
    console.error('Error creating MCP server:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
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
    const serverData = {
      name,
      description: serverConfig.description || '',
      command: serverConfig.command || null,
      args: serverConfig.args || [],
      env: serverConfig.env || {},
      url: serverConfig.url || null,
      type: serverConfig.type || McpServerType.STDIO,
      profile_uuid: profileUuid,
      status: McpServerStatus.ACTIVE,
    };

    // Encrypt sensitive fields before insertion
    const encryptedData = encryptServerData(serverData, profileUuid);

    // Insert the server into the database
    const inserted = await db.insert(mcpServersTable).values(encryptedData).returning({ uuid: mcpServersTable.uuid });
    if (inserted[0]?.uuid) {
        createdServerUuids.push(inserted[0].uuid);
    }
  }

  // Trigger discovery for all newly created servers in the background
  if (createdServerUuids.length > 0 && profileUuid) {
      console.log(`[Action] Triggering background tool discovery for ${createdServerUuids.length} bulk imported servers...`);
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
    const encryptedServerData = encryptServerData(serverToImport, profileUuid);

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
        
        console.log(`Imported custom instructions for server ${newServer.uuid}`);
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
  // Use the encryption utility to create a sanitized template
  const { createSanitizedTemplate } = await import('@/lib/encryption');
  const template = createSanitizedTemplate(server);
  
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
