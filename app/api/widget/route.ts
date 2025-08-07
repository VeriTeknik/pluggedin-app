import { and,eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { embeddedChatsTable } from '@/db/schema';

const WIDGET_SCRIPT = `
(function() {
  // Extract parameters from script tag
  const currentScript = document.currentScript;
  const scriptUrl = new URL(currentScript.src);
  const chatId = scriptUrl.searchParams.get('chatId');
  const apiKey = scriptUrl.searchParams.get('key') || scriptUrl.searchParams.get('api_key') || '';
  
  if (!chatId) {
    console.error('[Plugged.in Chat] Chat ID is required');
    return;
  }

  // Check if already loaded
  if (window.PluggedinChat && window.PluggedinChat.initialized) {
    console.warn('[Plugged.in Chat] Already initialized');
    return;
  }

  // Configuration
  const API_BASE = '{{API_BASE}}';
  const CHAT_ID = chatId;
  const API_KEY = apiKey;

  // Create namespace
  window.PluggedinChat = {
    chatId: CHAT_ID,
    apiBase: API_BASE,
    apiKey: API_KEY,
    initialized: false,
    iframe: null,
    isOpen: false,
    container: null,
    button: null
  };

  // Styles
  const styles = \`
    #pluggedin-chat-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    #pluggedin-chat-button {
      width: 60px;
      height: 60px;
      border-radius: 30px;
      background: #000;
      color: #fff;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: all 0.3s ease;
    }

    #pluggedin-chat-button:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }

    #pluggedin-chat-button svg {
      width: 28px;
      height: 28px;
      fill: currentColor;
    }

    #pluggedin-chat-iframe {
      position: fixed;
      bottom: 90px;
      right: 20px;
      width: 380px;
      height: 600px;
      max-height: calc(100vh - 110px);
      border: none;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      background: #fff;
      opacity: 0;
      transform: translateY(20px) scale(0.95);
      transition: all 0.3s ease;
      pointer-events: none;
      overflow: hidden;
    }

    #pluggedin-chat-iframe.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: all;
    }

    @media (max-width: 480px) {
      #pluggedin-chat-iframe {
        width: calc(100vw - 40px);
        height: calc(100vh - 110px);
        right: 20px;
        left: 20px;
      }
    }
  \`;

  // Create UI elements
  function createUI() {
    // Add styles
    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);

    // Create container
    const container = document.createElement('div');
    container.id = 'pluggedin-chat-container';
    document.body.appendChild(container);
    window.PluggedinChat.container = container;

    // Create chat button
    const button = document.createElement('button');
    button.id = 'pluggedin-chat-button';
    button.innerHTML = \`
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C6.48 2 2 6.48 2 12c0 1.54.36 3 .97 4.29L2 22l5.71-.97C9 21.64 10.46 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.41 0-2.73-.36-3.88-.99l-.28-.15-2.92.5.5-2.92-.15-.28C4.64 14.73 4.28 13.41 4.28 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z"/>
        <path d="M7 11h10v2H7zm0-3h10v2H7zm0 6h7v2H7z"/>
      </svg>
    \`;
    button.onclick = toggleChat;
    container.appendChild(button);
    window.PluggedinChat.button = button;

    // Create iframe
    const iframe = document.createElement('iframe');
    iframe.id = 'pluggedin-chat-iframe';
    iframe.src = \`\${API_BASE}/embed/chat/\${CHAT_ID}?key=\${encodeURIComponent(API_KEY)}\`;
    iframe.title = 'Plugged.in Chat';
    container.appendChild(iframe);
    window.PluggedinChat.iframe = iframe;

    // Listen for messages from iframe
    window.addEventListener('message', handleMessage);
  }

  // Toggle chat open/closed
  function toggleChat() {
    window.PluggedinChat.isOpen = !window.PluggedinChat.isOpen;
    if (window.PluggedinChat.isOpen) {
      window.PluggedinChat.iframe.classList.add('open');
      window.PluggedinChat.button.innerHTML = \`
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      \`;
      // Notify iframe that chat is opened
      window.PluggedinChat.iframe.contentWindow.postMessage({ type: 'chat:opened' }, '*');
      // Dispatch custom event
      window.dispatchEvent(new Event('pluggedin:chat:opened'));
    } else {
      window.PluggedinChat.iframe.classList.remove('open');
      window.PluggedinChat.button.innerHTML = \`
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.48 2 2 6.48 2 12c0 1.54.36 3 .97 4.29L2 22l5.71-.97C9 21.64 10.46 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.41 0-2.73-.36-3.88-.99l-.28-.15-2.92.5.5-2.92-.15-.28C4.64 14.73 4.28 13.41 4.28 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z"/>
          <path d="M7 11h10v2H7zm0-3h10v2H7zm0 6h7v2H7z"/>
        </svg>
      \`;
      // Notify iframe that chat is closed
      window.PluggedinChat.iframe.contentWindow.postMessage({ type: 'chat:closed' }, '*');
      // Dispatch custom event
      window.dispatchEvent(new Event('pluggedin:chat:closed'));
    }
  }

  // Handle messages from iframe
  function handleMessage(event) {
    // Verify origin
    if (!event.origin.startsWith(API_BASE)) {
      return;
    }

    const { type, data } = event.data || {};
    
    switch (type) {
      case 'chat:ready':
        window.PluggedinChat.initialized = true;
        window.dispatchEvent(new Event('pluggedin:chat:ready'));
        break;
      case 'chat:close':
        if (window.PluggedinChat.isOpen) {
          toggleChat();
        }
        break;
      case 'chat:notification':
        // Show notification badge
        if (!window.PluggedinChat.isOpen && data && data.count > 0) {
          // Add notification badge logic here
        }
        break;
    }
  }

  // Public API
  window.PluggedinChat.open = function() {
    if (!window.PluggedinChat.isOpen) {
      toggleChat();
    }
  };

  window.PluggedinChat.close = function() {
    if (window.PluggedinChat.isOpen) {
      toggleChat();
    }
  };

  window.PluggedinChat.destroy = function() {
    if (window.PluggedinChat.container) {
      window.PluggedinChat.container.remove();
    }
    window.removeEventListener('message', handleMessage);
    window.PluggedinChat = null;
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createUI);
  } else {
    createUI();
  }
})();
`;

export async function GET(req: NextRequest) {
  try {
    // Extract chatId from query params
    const url = new URL(req.url);
    const chatId = url.searchParams.get('chatId');
    const apiKey = url.searchParams.get('key') || url.searchParams.get('api_key') || '';
    
    if (!chatId) {
      return new NextResponse('// Chat ID is required', {
        status: 400,
        headers: {
          'Content-Type': 'application/javascript',
        },
      });
    }
    
    // Verify chat exists and is active
    const [chat] = await db
      .select({
        uuid: embeddedChatsTable.uuid,
        require_api_key: embeddedChatsTable.require_api_key,
        api_key: embeddedChatsTable.api_key,
      })
      .from(embeddedChatsTable)
      .where(and(
        eq(embeddedChatsTable.uuid, chatId),
        eq(embeddedChatsTable.is_active, true)
      ))
      .limit(1);

    if (!chat) {
      return new NextResponse('// Chat not found or inactive', {
        status: 404,
        headers: {
          'Content-Type': 'application/javascript',
        },
      });
    }

    // Validate API key if required
    if (chat.require_api_key) {
      if (!apiKey) {
        return new NextResponse('// API key required', {
          status: 401,
          headers: {
            'Content-Type': 'application/javascript',
          },
        });
      }
      
      // Verify API key matches
      if (chat.api_key !== apiKey) {
        return new NextResponse('// Invalid API key', {
          status: 403,
          headers: {
            'Content-Type': 'application/javascript',
          },
        });
      }
    }

    // Get base URL
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('host') || 'plugged.in';
    const baseUrl = `${protocol}://${host}`;

    // Generate widget script with configuration
    const script = WIDGET_SCRIPT.replace(/{{API_BASE}}/g, baseUrl);

    return new NextResponse(script, {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Access-Control-Allow-Origin': '*', // Allow embedding on any domain
      },
    });
  } catch (error) {
    console.error('Error serving widget script:', error);
    return new NextResponse('// Error loading widget', {
      status: 500,
      headers: {
        'Content-Type': 'application/javascript',
      },
    });
  }
}