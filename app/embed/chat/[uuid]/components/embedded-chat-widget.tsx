'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, X, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { getOrCreateVisitorId, formatVisitorName, getUserInfoFromParent } from '@/lib/visitor-utils';
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
      let assistantMessage: Message = {
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
  const handleClose = async () => {
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
  };

  // Parse theme colors
  const themeColors = chat.theme_color ? {
    primary: chat.theme_color,
    primaryForeground: '#ffffff',
  } : {
    primary: '#000000',
    primaryForeground: '#ffffff',
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div 
        className="flex items-center justify-between p-4 border-b"
        style={{ backgroundColor: themeColors.primary, color: themeColors.primaryForeground }}
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
        <Button
          variant="ghost"
          size="icon"
          className="text-inherit hover:bg-white/10"
          onClick={handleClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm mb-4">{chat.welcome_message || 'Start a conversation'}</p>
            
            {/* Suggested Questions */}
            {chat.suggested_questions && chat.suggested_questions.length > 0 && (
              <div className="space-y-2 px-4">
                <p className="text-xs text-muted-foreground mb-2">Try asking:</p>
                {chat.suggested_questions.slice(0, 3).map((question, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    className="w-full text-xs justify-start"
                    onClick={() => {
                      setInput(question);
                      inputRef.current?.focus();
                    }}
                  >
                    {question}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex gap-3',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.role === 'assistant' && (
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback>AI</AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-4 py-2',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                  style={message.role === 'user' ? {
                    backgroundColor: themeColors.primary,
                    color: themeColors.primaryForeground,
                  } : undefined}
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
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback>U</AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback>AI</AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-lg px-4 py-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input - Extra right padding to accommodate language switcher */}
      <form onSubmit={handleSubmit} className="p-4 pr-16 border-t">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={chat.placeholder_text || "Type your message..."}
            disabled={isLoading}
            className="flex-1"
            autoFocus
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isLoading}
            style={{
              backgroundColor: themeColors.primary,
              color: themeColors.primaryForeground,
            }}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}