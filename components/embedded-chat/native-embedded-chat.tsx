'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useUser } from '@/hooks/use-user';
import { Send, X, Loader2, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getOrCreateVisitorId, formatVisitorName } from '@/lib/visitor-utils';

// Helper to ensure absolute URLs for API calls
function getApiUrl(path: string) {
  // In production, use the origin. In development, ensure we use the correct base URL
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`;
  }
  return path;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  authenticated?: boolean;
  userName?: string;
  userAvatar?: string;
}

interface NativeEmbeddedChatProps {
  chatUuid: string;
  className?: string;
  position?: 'fixed' | 'relative';
  welcomeMessage?: string;
  placeholder?: string;
}

export function NativeEmbeddedChat({
  chatUuid,
  className,
  position = 'fixed',
  welcomeMessage = 'Hi! How can I help you today?',
  placeholder = 'Type your message...',
}: NativeEmbeddedChatProps) {
  const { isAuthenticated, session } = useAuth();
  const { user } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [visitorId, setVisitorId] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize visitor ID
  useEffect(() => {
    const id = getOrCreateVisitorId();
    setVisitorId(id);
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Add welcome message when chat opens
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: welcomeMessage,
        timestamp: new Date(),
      }]);
    }
  }, [isOpen, welcomeMessage]);

  // Heartbeat mechanism
  useEffect(() => {
    if (!conversationId || !isOpen) return;

    const sendHeartbeat = async () => {
      try {
        await fetch(getApiUrl(`/api/public/chat/${chatUuid}/heartbeat`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: conversationId }),
        });
      } catch (error) {
        console.error('Failed to send heartbeat:', error);
      }
    };

    heartbeatIntervalRef.current = setInterval(sendHeartbeat, 30000);
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [conversationId, isOpen, chatUuid]);

  // End conversation when closing
  const handleClose = async () => {
    if (conversationId) {
      try {
        await fetch(getApiUrl(`/api/public/chat/${chatUuid}/end`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: conversationId }),
        });
      } catch (error) {
        console.error('Failed to end conversation:', error);
      }
    }
    setIsOpen(false);
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
      authenticated: isAuthenticated,
      userName: user?.name || user?.username || undefined,
      userAvatar: user?.image || undefined,
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await fetch(getApiUrl(`/api/public/chat/${chatUuid}/stream`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          conversation_id: conversationId || undefined,
          visitor_info: {
            visitor_id: visitorId,
            name: user?.name || user?.username || formatVisitorName(visitorId),
            email: user?.email || undefined,
          },
          // Include authenticated user info for native component
          authenticated_user: isAuthenticated ? {
            id: session?.user?.id || '',
            name: user?.name || user?.username || '',
            avatar: user?.image || '',
          } : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('API Error:', response.status, errorData);
        throw new Error(`Failed to send message: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage: Message = {
        id: Date.now().toString() + '-assistant',
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.conversation_id && !conversationId) {
                setConversationId(data.conversation_id);
              }

              if (data.type === 'content' || data.type === 'text') {
                assistantMessage.content += data.content;
                setMessages(prev => prev.map(msg => 
                  msg.id === assistantMessage.id 
                    ? { ...msg, content: assistantMessage.content }
                    : msg
                ));
              } else if (data.type === 'error') {
                console.error('Chat error:', data.content);
                assistantMessage.content = data.content;
                setMessages(prev => prev.map(msg => 
                  msg.id === assistantMessage.id 
                    ? { ...msg, content: assistantMessage.content }
                    : msg
                ));
              }
            } catch (e) {
              console.error('Failed to parse chunk:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setMessages(prev => [...prev, {
        id: Date.now().toString() + '-error',
        role: 'assistant',
        content: `Sorry, I encountered an error: ${errorMessage}. Please try again or refresh the page.`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderAvatar = (message: Message) => {
    if (message.role === 'assistant') {
      return (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-sm font-medium">
          AI
        </div>
      );
    }

    if (message.authenticated && message.userAvatar) {
      return (
        <img 
          src={message.userAvatar} 
          alt={message.userName || 'User'} 
          className="w-8 h-8 rounded-full"
        />
      );
    }

    return (
      <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-sm font-medium">
        {message.userName?.charAt(0).toUpperCase() || 'U'}
      </div>
    );
  };

  if (!isOpen && position === 'fixed') {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 w-14 h-14 bg-gradient-to-br from-purple-600 to-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4z"
          />
        </svg>
      </button>
    );
  }

  const chatContent = (
    <>
      <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-gradient-to-r from-purple-600 to-blue-600 text-white">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4z"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold">AI Assistant</h3>
            <p className="text-xs opacity-90">Online</p>
          </div>
          {isAuthenticated && (
            <Shield className="w-4 h-4 ml-2" title="Authenticated user" />
          )}
        </div>
        {position === 'fixed' && (
          <button
            onClick={handleClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <ScrollArea className="flex-1 p-4 bg-white dark:bg-gray-800">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex items-start space-x-3',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.role === 'assistant' && renderAvatar(message)}
              <div
                className={cn(
                  'max-w-[80%] rounded-lg px-4 py-2',
                  message.role === 'user'
                    ? 'bg-gradient-to-br from-purple-600 to-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                )}
              >
                {message.role === 'user' && message.authenticated && (
                  <div className="flex items-center space-x-1 mb-1 text-xs opacity-80">
                    <Shield className="w-3 h-3" />
                    <span>{message.userName}</span>
                  </div>
                )}
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
              {message.role === 'user' && renderAvatar(message)}
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">AI is typing...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t dark:border-gray-700">
        <div className="flex space-x-2">
          <Textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={placeholder}
            className="flex-1 min-h-[60px] resize-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
            disabled={isLoading}
          />
          <Button
            onClick={sendMessage}
            disabled={isLoading || !inputValue.trim()}
            className="bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </>
  );

  if (position === 'relative') {
    return (
      <div className={cn('h-full flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden', className)}>
        {chatContent}
      </div>
    );
  }

  return (
    <div className={cn(
      'fixed bottom-4 right-4 w-96 h-[600px] bg-white dark:bg-gray-800 rounded-lg shadow-2xl flex flex-col overflow-hidden',
      className
    )}>
      {chatContent}
    </div>
  );
}