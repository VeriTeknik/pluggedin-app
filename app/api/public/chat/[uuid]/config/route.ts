import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { embeddedChatsTable, chatPersonasTable, mcpServersTable, profilesTable } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { createCorsOptionsResponse, isDomainAllowed, setCorsHeaders } from '@/lib/cors-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const { uuid: chatUuid } = await params;
    
    if (!chatUuid) {
      return NextResponse.json(
        { error: 'Chat UUID is required' },
        { status: 400 }
      );
    }

    // Check for API key in headers
    const apiKey = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '');
    
    // Build where conditions
    const whereConditions = [eq(embeddedChatsTable.uuid, chatUuid)];
    
    // If API key is required, validate it
    if (apiKey) {
      whereConditions.push(eq(embeddedChatsTable.api_key, apiKey));
    } else {
      // If no API key provided, only allow public chats
      whereConditions.push(eq(embeddedChatsTable.is_public, true));
    }
    
    // Always check that chat is active
    whereConditions.push(eq(embeddedChatsTable.is_active, true));

    const [chat] = await db
      .select({
        uuid: embeddedChatsTable.uuid,
        name: embeddedChatsTable.name,
        position: embeddedChatsTable.position,
        theme_config: embeddedChatsTable.theme_config,
        welcome_message: embeddedChatsTable.welcome_message,
        suggested_questions: embeddedChatsTable.suggested_questions,
        bot_avatar_url: embeddedChatsTable.bot_avatar_url,
        expose_capabilities: embeddedChatsTable.expose_capabilities,
        enable_rag: embeddedChatsTable.enable_rag,
        debug_mode: embeddedChatsTable.debug_mode,
        enabled_mcp_server_uuids: embeddedChatsTable.enabled_mcp_server_uuids,
        project_uuid: embeddedChatsTable.project_uuid,
        allowed_domains: embeddedChatsTable.allowed_domains,
      })
      .from(embeddedChatsTable)
      .where(and(...whereConditions))
      .limit(1);

    if (!chat) {
      return NextResponse.json(
        { error: 'Chat not found or access denied' },
        { status: 404 }
      );
    }

    // Fetch the default persona for this chat
    const defaultPersona = await db
      .select({
        id: chatPersonasTable.id,
        name: chatPersonasTable.name,
        avatar_url: chatPersonasTable.avatar_url,
        role: chatPersonasTable.role,
        instructions: chatPersonasTable.instructions,
      })
      .from(chatPersonasTable)
      .where(and(
        eq(chatPersonasTable.embedded_chat_uuid, chat.uuid),
        eq(chatPersonasTable.is_default, true),
        eq(chatPersonasTable.is_active, true)
      ))
      .limit(1);

    // Fetch enabled MCP servers if any
    let mcpServers = [];
    if (chat.enabled_mcp_server_uuids && chat.enabled_mcp_server_uuids.length > 0) {
      // Get all profiles for this project
      const profiles = await db
        .select({ uuid: profilesTable.uuid })
        .from(profilesTable)
        .where(eq(profilesTable.project_uuid, chat.project_uuid));
      
      const profileUuids = profiles.map(p => p.uuid);
      
      if (profileUuids.length > 0) {
        // Fetch MCP servers that are enabled and belong to this project's profiles
        const servers = await db
          .select({
            uuid: mcpServersTable.uuid,
            name: mcpServersTable.name,
            type: mcpServersTable.type,
            description: mcpServersTable.description,
          })
          .from(mcpServersTable)
          .where(and(
            inArray(mcpServersTable.uuid, chat.enabled_mcp_server_uuids),
            inArray(mcpServersTable.profile_uuid, profileUuids)
          ));
        
        mcpServers = servers;
      }
    }

    // Extract appearance settings from theme_config or provide defaults
    const themeConfig = (chat.theme_config as any) || {};
    
    // Return the configuration
    const config = {
      uuid: chat.uuid,
      name: chat.name,
      position: chat.position || 'bottom-right',
      theme: themeConfig.theme || {
        primaryColor: themeConfig.primaryColor || '#3b82f6',
        secondaryColor: themeConfig.secondaryColor || '#e5e7eb',
        backgroundColor: themeConfig.backgroundColor || '#ffffff',
        textColor: themeConfig.textColor || '#111827',
        borderRadius: themeConfig.borderRadius || 12,
        fontSize: themeConfig.fontSize || 14,
        fontFamily: themeConfig.fontFamily || 'system-ui, sans-serif'
      },
      dimensions: themeConfig.dimensions || {
        width: themeConfig.width || 380,
        height: themeConfig.height || 600,
        minimizedSize: themeConfig.minimizedSize || 60
      },
      behavior: themeConfig.behavior || {
        autoOpen: themeConfig.autoOpen || false,
        showWelcome: themeConfig.showWelcome ?? true,
        enableNotifications: themeConfig.enableNotifications ?? true,
        showTypingIndicator: themeConfig.showTypingIndicator ?? true,
        enableSounds: themeConfig.enableSounds || false
      },
      branding: themeConfig.branding || {
        showPoweredBy: themeConfig.showPoweredBy ?? true,
        customLogo: themeConfig.customLogo || null,
        customTitle: themeConfig.customTitle || null
      },
      welcome_message: chat.welcome_message,
      suggested_questions: chat.suggested_questions || [],
      bot_avatar_url: chat.bot_avatar_url, // Keep the chat's avatar
      default_persona: defaultPersona[0] || null, // Persona info separately
      expose_capabilities: chat.expose_capabilities || false,
      enable_rag: chat.enable_rag || false,
      debug_mode: chat.debug_mode || false,
      mcp_servers: mcpServers.map(server => ({
        name: server.name,
        type: server.type,
        description: server.description,
      })),
      // Legacy support
      theme_config: chat.theme_config,
    };

    const origin = request.headers.get('origin');
    const response = NextResponse.json(config);
    
    // Add CORS headers only for allowed domains
    setCorsHeaders(response, origin, chat.allowed_domains);
    
    return response;
  } catch (error) {
    console.error('Error fetching chat config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Enable CORS for this endpoint
export async function OPTIONS(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const origin = request.headers.get('origin');
  const { uuid } = await params;
  
  // Get chat configuration to check allowed domains
  const [chat] = await db
    .select({ allowed_domains: embeddedChatsTable.allowed_domains })
    .from(embeddedChatsTable)
    .where(eq(embeddedChatsTable.uuid, uuid))
    .limit(1);
  
  const allowedDomains = chat?.allowed_domains || null;
  return createCorsOptionsResponse(origin, allowedDomains);
}