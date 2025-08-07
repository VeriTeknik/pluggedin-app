'use client';

import { MessageSquare, Send, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getOrCreateVisitorId, getUserInfoFromParent } from '@/lib/visitor-utils';
import type { EmbeddedChat, Project } from '@/types/embedded-chat';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface EmbeddedChatWidgetProps {
  chat: EmbeddedChat;
  project: Project;
}

export function EmbeddedChatWidget({ chat, project }: EmbeddedChatWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [visitorId, setVisitorId] = useState<string>('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [visitorInfo, setVisitorInfo] = useState<{
    name?: string;
    email?: string;
  }>({});
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize visitor ID and restore conversation
  useEffect(() => {
    // Get or create visitor ID
    const id = getOrCreateVisitorId();
    setVisitorId(id);
    
    // Try to restore conversation ID from session storage
    const storedConversationId = sessionStorage.getItem(`chat-${chat.uuid}-conversation`);
    if (storedConversationId) {
      setConversationId(storedConversationId);
    }
    
    // Check for user info from parent
    const userInfo = getUserInfoFromParent();
    if (userInfo) {
      setVisitorInfo({
        name: userInfo.userName,
        email: userInfo.userEmail,
      });
    }
  }, [chat.uuid]);

  // Send ready message to parent and handle parent messages
  useEffect(() => {
    if (window.parent !== window) {
      // Send ready message with visitor info
      window.parent.postMessage({ 
        type: 'chat:ready', 
        chatUuid: chat.uuid,
        visitorId: visitorId 
      }, '*');
      
      // Listen for parent messages
      const handleParentMessage = (event: MessageEvent) => {
        // In production, verify the origin
        if (event.data?.type === 'chat:minimize') {
          // Handle minimize from parent
        } else if (event.data?.type === 'chat:maximize') {
          // Handle maximize from parent  
        } else if (event.data?.type === 'chat:close') {
          // Handle close from parent
          handleClose();
        } else if (event.data?.type === 'chat:userInfo') {
          // Handle user info from parent
          if (event.data.userId) {
            setVisitorInfo({
              name: event.data.userName,
              email: event.data.userEmail,
            });
          }
        }
      };
      
      window.addEventListener('message', handleParentMessage);
      return () => window.removeEventListener('message', handleParentMessage);
    }
  }, [chat.uuid, visitorId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // Set up heartbeat for active conversation
  useEffect(() => {
    if (conversationId) {
      // Send heartbeat every 30 seconds
      const sendHeartbeat = async () => {
        try {
          await fetch(`/api/public/chat/${chat.uuid}/heartbeat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              conversation_id: conversationId,
            }),
          });
        } catch (error) {
          console.error('Error sending heartbeat:', error);
        }
      };

      // Send initial heartbeat
      sendHeartbeat();

      // Set up interval
      heartbeatIntervalRef.current = setInterval(sendHeartbeat, 30000);

      return () => {
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
      };
    }
  }, [conversationId, chat.uuid]);

  // Handle message submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Send message to backend with visitor info
      const response = await fetch(`/api/public/chat/${chat.uuid}/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          conversation_id: conversationId || undefined,
          visitor_info: {
            visitor_id: visitorId,
            name: visitorInfo.name,
            email: visitorInfo.email,
          },
          persona_id: undefined, // Can be set if using personas
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };
      
      // Add empty assistant message that we'll update
      setMessages(prev => [...prev, assistantMessage]);

      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  
                  if (data.type === 'conversation') {
                    // Store conversation ID
                    setConversationId(data.conversation_id);
                    sessionStorage.setItem(`chat-${chat.uuid}-conversation`, data.conversation_id);
                  } else if (data.type === 'content') {
                    // Update assistant message content
                    assistantMessage.content += data.content;
                    setMessages(prev => 
                      prev.map(msg => 
                        msg.id === assistantMessage.id 
                          ? { ...msg, content: assistantMessage.content }
                          : msg
                      )
                    );
                  } else if (data.type === 'error') {
                    throw new Error(data.content || 'Stream error');
                  }
                } catch (e) {
                  console.error('Error parsing SSE data:', e);
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Add error message
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again later.',
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      // Focus input after response
      inputRef.current?.focus();
    }
  };

  // Handle close button
  const handleClose = useCallback(async () => {
    // End the conversation if it exists
    if (conversationId) {
      try {
        await fetch(`/api/public/chat/${chat.uuid}/end`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            conversation_id: conversationId,
          }),
        });
      } catch (error) {
        console.error('Error ending conversation:', error);
      }
    }
    
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'chat:close' }, '*');
    }
  }, [conversationId, chat.uuid]);

  // Parse theme from theme_config with fallbacks
  const themeConfig = chat.theme_config && typeof chat.theme_config === 'object' ? chat.theme_config : {};
  const themeColors = {
    primary: themeConfig.primaryColor || chat.theme_color || '#3b82f6',
    primaryForeground: '#ffffff',
    secondary: themeConfig.secondaryColor || '#e5e7eb',
    background: themeConfig.backgroundColor || '#ffffff',
    text: themeConfig.textColor || '#111827',
    borderRadius: themeConfig.borderRadius || 12,
    fontFamily: themeConfig.fontFamily || 'system-ui, sans-serif',
    fontSize: themeConfig.fontSize || 14,
  };

  return (
    <div
      className="flex flex-col h-screen"
      style={{
        backgroundColor: themeColors.background,
        fontFamily: themeColors.fontFamily,
        fontSize: `${themeColors.fontSize}px`,
        color: themeColors.text
      }}
    >
      <style jsx global>{`
        * {
          box-sizing: border-box;
        }
        
        /* Override any external styles */
        .embedded-chat-container * {
          font-family: ${themeColors.fontFamily} !important;
        }
        
        /* Remove language switcher and any overlay elements */
        [id*="google_translate"],
        [class*="skiptranslate"],
        [class*="goog-te-"],
        .goog-te-combo,
        .goog-te-banner-frame,
        .goog-te-menu-frame,
        .language-switcher {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `}</style>
      {/* Header */}
      <div
        className="flex items-center justify-between p-4"
        style={{
          backgroundColor: themeColors.primary,
          color: themeColors.primaryForeground,
          borderBottom: `1px solid ${themeColors.secondary}`
        }}
      >
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            {project.avatar_url ? (
              <AvatarImage src={project.avatar_url} alt={project.name} />
            ) : (
              <AvatarFallback>
                <MessageSquare className="h-4 w-4" />
              </AvatarFallback>
            )}
          </Avatar>
          <div>
            <h3 className="font-semibold text-sm">{chat.name}</h3>
            <p className="text-xs opacity-80">
              {chat.welcome_message || 'How can I help you today?'}
            </p>
          </div>
        </div>
        <button
          className="text-inherit hover:bg-white/10 p-2 rounded"
          style={{
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            borderRadius: `${themeColors.borderRadius}px`
          }}
          onClick={handleClose}
          title="Close chat"
          aria-label="Close chat"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div
        className="flex-1 p-4 overflow-y-auto"
        ref={scrollAreaRef}
        style={{
          backgroundColor: themeColors.background,
          color: themeColors.text
        }}
      >
        {messages.length === 0 ? (
          <div className="text-center py-8" style={{ color: `${themeColors.text}80` }}>
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm mb-4">{chat.welcome_message || 'Start a conversation'}</p>
            
            {/* Suggested Questions */}
            {chat.suggested_questions && chat.suggested_questions.length > 0 && (
              <div className="space-y-2 px-4">
                <p className="text-xs mb-2" style={{ color: `${themeColors.text}60` }}>Try asking:</p>
                {chat.suggested_questions.slice(0, 3).map((question, index) => (
                  <button
                    key={index}
                    className="w-full text-xs text-left p-2 rounded border"
                    style={{
                      border: `1px solid ${themeColors.secondary}`,
                      backgroundColor: 'transparent',
                      color: themeColors.text,
                      borderRadius: `${themeColors.borderRadius}px`,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = themeColors.primary;
                      e.currentTarget.style.color = themeColors.primary;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = themeColors.secondary;
                      e.currentTarget.style.color = themeColors.text;
                    }}
                    onClick={() => {
                      setInput(question);
                      inputRef.current?.focus();
                    }}
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div
                    className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full"
                    style={{ backgroundColor: themeColors.secondary, color: themeColors.text }}
                  >
                    AI
                  </div>
                )}
                <div
                  className="max-w-[80%] px-4 py-2"
                  style={{
                    backgroundColor: message.role === 'user' ? themeColors.primary : themeColors.secondary,
                    color: message.role === 'user' ? themeColors.primaryForeground : themeColors.text,
                    borderRadius: `${themeColors.borderRadius}px`,
                    borderBottomLeftRadius: message.role === 'assistant' ? '4px' : `${themeColors.borderRadius}px`,
                    borderBottomRightRadius: message.role === 'user' ? '4px' : `${themeColors.borderRadius}px`,
                  }}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {new Date(message.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                {message.role === 'user' && (
                  <div
                    className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full"
                    style={{ backgroundColor: themeColors.primary, color: themeColors.primaryForeground }}
                  >
                    U
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div
                  className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full"
                  style={{ backgroundColor: themeColors.secondary, color: themeColors.text }}
                >
                  AI
                </div>
                <div
                  className="px-4 py-2"
                  style={{
                    backgroundColor: themeColors.secondary,
                    borderRadius: `${themeColors.borderRadius}px`,
                    borderBottomLeftRadius: '4px'
                  }}
                >
                  <div className="flex gap-1">
                    <div
                      className="w-2 h-2 rounded-full animate-bounce"
                      style={{ backgroundColor: `${themeColors.text}50` }}
                    />
                    <div
                      className="w-2 h-2 rounded-full animate-bounce"
                      style={{
                        backgroundColor: `${themeColors.text}50`,
                        animationDelay: '0.2s'
                      }}
                    />
                    <div
                      className="w-2 h-2 rounded-full animate-bounce"
                      style={{
                        backgroundColor: `${themeColors.text}50`,
                        animationDelay: '0.4s'
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input - No extra padding needed since we're removing language switcher */}
      <form
        onSubmit={handleSubmit}
        className="p-4"
        style={{ borderTop: `1px solid ${themeColors.secondary}` }}
      >
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={chat.placeholder_text || "Type your message..."}
            disabled={isLoading}
            className="flex-1 px-3 py-2 border rounded outline-none"
            style={{
              border: `1px solid ${themeColors.secondary}`,
              borderRadius: `${themeColors.borderRadius}px`,
              backgroundColor: themeColors.background,
              color: themeColors.text,
              fontFamily: themeColors.fontFamily,
              fontSize: `${themeColors.fontSize}px`
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = themeColors.primary;
              e.currentTarget.style.boxShadow = `0 0 0 3px ${themeColors.primary}20`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = themeColors.secondary;
              e.currentTarget.style.boxShadow = 'none';
            }}
            autoFocus
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: themeColors.primary,
              color: themeColors.primaryForeground,
              borderRadius: `${themeColors.borderRadius}px`,
              border: 'none',
              cursor: !input.trim() || isLoading ? 'not-allowed' : 'pointer',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Send message"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}