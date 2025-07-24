import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/db';
import { embeddedChatsTable } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';

const EMBED_SCRIPT_TEMPLATE = `
(function() {
  // Configuration
  const CHAT_ID = '{{CHAT_ID}}';
  const API_BASE = '{{API_BASE}}';
  const WIDGET_URL = '{{WIDGET_URL}}';
  const API_KEY = '{{API_KEY}}';
  
  // Check if already loaded
  if (window.PluggedinChat) {
    console.warn('Pluggedin Chat is already loaded');
    return;
  }

  // Create namespace
  window.PluggedinChat = {
    chatId: CHAT_ID,
    apiBase: API_BASE,
    widgetUrl: WIDGET_URL,
    apiKey: API_KEY,
    initialized: false,
    iframe: null,
    isOpen: false,
  };

  // Load widget script
  function loadWidget() {
    const script = document.createElement('script');
    script.src = WIDGET_URL + '/widget.js';
    script.async = true;
    script.onload = function() {
      window.PluggedinChat.initialize();
    };
    script.onerror = function() {
      console.error('Failed to load Pluggedin Chat widget');
    };
    document.head.appendChild(script);
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadWidget);
  } else {
    loadWidget();
  }
})();
`;

export async function GET(
  req: NextRequest,
  { params }: { params: { uuid: string } }
) {
  try {
    // Remove .js extension if present
    const chatUuid = params.uuid.replace(/\.js$/, '');
    
    // Extract API key from query params
    const url = new URL(req.url);
    const apiKey = url.searchParams.get('key') || url.searchParams.get('api_key') || '';
    
    // Verify chat exists and is public
    const [chat] = await db
      .select({
        uuid: embeddedChatsTable.uuid,
      })
      .from(embeddedChatsTable)
      .where(and(
        eq(embeddedChatsTable.uuid, chatUuid),
        eq(embeddedChatsTable.is_public, true),
        eq(embeddedChatsTable.is_active, true)
      ))
      .limit(1);

    if (!chat) {
      return new NextResponse('// Chat not found', {
        status: 404,
        headers: {
          'Content-Type': 'application/javascript',
        },
      });
    }

    // Get base URL
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('host') || 'plugged.in';
    const baseUrl = `${protocol}://${host}`;

    // Generate embed script
    const script = EMBED_SCRIPT_TEMPLATE
      .replace(/{{CHAT_ID}}/g, chatUuid)
      .replace(/{{API_BASE}}/g, baseUrl)
      .replace(/{{WIDGET_URL}}/g, `${baseUrl}/embed`)
      .replace(/{{API_KEY}}/g, apiKey);

    // Update install count
    await db
      .update(embeddedChatsTable)
      .set({
        install_count: sql`COALESCE(install_count, 0) + 1`,
        last_active_at: new Date(),
      })
      .where(eq(embeddedChatsTable.uuid, chatUuid));

    return new NextResponse(script, {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('Error serving embed script:', error);
    return new NextResponse('// Error loading chat', {
      status: 500,
      headers: {
        'Content-Type': 'application/javascript',
      },
    });
  }
}