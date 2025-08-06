import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { embeddedChatsTable, chatPersonasTable } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { extractApiKey } from '@/lib/api-key';

async function validateApiKeyAccess(chatUuid: string, apiKey: string | null) {
  const [chat] = await db
    .select({
      require_api_key: embeddedChatsTable.require_api_key,
      api_key: embeddedChatsTable.api_key,
    })
    .from(embeddedChatsTable)
    .where(eq(embeddedChatsTable.uuid, chatUuid))
    .limit(1);
  
  if (!chat) return false;
  
  // If API key not required, allow access
  if (!chat.require_api_key) return true;
  
  // If API key required but not provided
  if (!apiKey) return false;
  
  // Validate API key and update last used timestamp
  if (chat.api_key === apiKey) {
    // Update last used timestamp asynchronously (non-blocking)
    db.update(embeddedChatsTable)
      .set({ api_key_last_used_at: new Date() })
      .where(eq(embeddedChatsTable.uuid, chatUuid))
      .execute()
      .catch(console.error);
    
    return true;
  }
  
  return false;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const { uuid } = await params;
    
    // Extract API key from request
    const apiKey = extractApiKey(req);
    
    // Validate API key access first
    const hasApiKeyAccess = await validateApiKeyAccess(uuid, apiKey);
    if (!hasApiKeyAccess) {
      return NextResponse.json(
        { error: 'Invalid or missing API key' }, 
        { status: 401 }
      );
    }
    
    // Check origin for domain whitelist
    const origin = req.headers.get('origin') || req.headers.get('referer');
    
    // Get embedded chat config
    const [chat] = await db
      .select({
        uuid: embeddedChatsTable.uuid,
        name: embeddedChatsTable.name,
        welcome_message: embeddedChatsTable.welcome_message,
        suggested_questions: embeddedChatsTable.suggested_questions,
        theme_config: embeddedChatsTable.theme_config,
        position: embeddedChatsTable.position,
        offline_config: embeddedChatsTable.offline_config,
        allowed_domains: embeddedChatsTable.allowed_domains,
        is_active: embeddedChatsTable.is_active,
        bot_avatar_url: embeddedChatsTable.bot_avatar_url,
        expose_capabilities: embeddedChatsTable.expose_capabilities,
        enabled_mcp_server_uuids: embeddedChatsTable.enabled_mcp_server_uuids,
        enable_rag: embeddedChatsTable.enable_rag,
      })
      .from(embeddedChatsTable)
      .where(and(
        eq(embeddedChatsTable.uuid, uuid),
        eq(embeddedChatsTable.is_public, true),
        eq(embeddedChatsTable.is_active, true)
      ))
      .limit(1);

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    // Validate domain if whitelist is configured
    if (chat.allowed_domains && chat.allowed_domains.length > 0 && origin) {
      const originUrl = new URL(origin);
      const isAllowed = chat.allowed_domains.some(domain => {
        // Support wildcards like *.example.com
        const regex = new RegExp(
          '^' + domain.replace(/\*/g, '.*').replace(/\./g, '\\.') + '$'
        );
        return regex.test(originUrl.hostname);
      });

      if (!isAllowed) {
        return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
      }
    }

    // Get public personas
    const personas = await db
      .select({
        id: chatPersonasTable.id,
        name: chatPersonasTable.name,
        role: chatPersonasTable.role,
        avatar_url: chatPersonasTable.avatar_url,
        is_default: chatPersonasTable.is_default,
      })
      .from(chatPersonasTable)
      .where(and(
        eq(chatPersonasTable.embedded_chat_uuid, uuid),
        eq(chatPersonasTable.is_active, true)
      ))
      .orderBy(chatPersonasTable.display_order);

    // Get MCP server info if capabilities should be exposed
    let mcpServers = [];
    if (chat.expose_capabilities && chat.enabled_mcp_server_uuids && chat.enabled_mcp_server_uuids.length > 0) {
      // Get basic info about enabled MCP servers
      const { mcpServersTable } = await import('@/db/schema');
      const { inArray } = await import('drizzle-orm');
      mcpServers = await db
        .select({
          name: mcpServersTable.name,
          type: mcpServersTable.type,
          description: mcpServersTable.description,
        })
        .from(mcpServersTable)
        .where(inArray(mcpServersTable.uuid, chat.enabled_mcp_server_uuids));
    }

    // Return public configuration
    const response = NextResponse.json({
      chat: {
        uuid: chat.uuid,
        name: chat.name,
        welcome_message: chat.welcome_message,
        suggested_questions: chat.suggested_questions,
        theme_config: chat.theme_config,
        position: chat.position,
        offline_config: chat.offline_config,
        bot_avatar_url: chat.bot_avatar_url,
        expose_capabilities: chat.expose_capabilities,
        enable_rag: chat.enable_rag,
        mcp_servers: chat.expose_capabilities ? mcpServers : undefined,
      },
      personas,
    });

    // Add CORS headers
    if (origin) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    }

    return response;
  } catch (error) {
    console.error('Error getting public chat config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') || req.headers.get('referer');
  const response = new NextResponse(null, { status: 200 });
  
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  
  return response;
}