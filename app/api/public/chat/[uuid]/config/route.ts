import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { embeddedChatsTable, chatPersonasTable } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

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
      // Legacy support
      theme_config: chat.theme_config,
    };

    return NextResponse.json(config);
  } catch (error) {
    console.error('Error fetching chat config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Enable CORS for this endpoint
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    },
  });
}