'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, X, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
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
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Send ready message to parent and handle parent messages
  useEffect(() => {
    if (window.parent !== window) {
      // Send ready message
      window.parent.postMessage({ type: 'chat:ready', chatUuid: chat.uuid }, '*');
      
      // Listen for parent messages
      const handleParentMessage = (event: MessageEvent) => {
        // In production, verify the origin
        if (event.data?.type === 'chat:minimize') {
          // Handle minimize from parent
        } else if (event.data?.type === 'chat:maximize') {
          // Handle maximize from parent  
        } else if (event.data?.type === 'chat:close') {
          // Handle close from parent
        }
      };
      
      window.addEventListener('message', handleParentMessage);
      return () => window.removeEventListener('message', handleParentMessage);
    }
  }, [chat.uuid]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

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
      // Send message to backend
      const response = await fetch('/api/embedded-chat/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatUuid: chat.uuid,
          message: userMessage.content,
          conversationId: sessionStorage.getItem(`chat-${chat.uuid}-conversation`) || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();

      // Store conversation ID for context
      if (data.conversationId) {
        sessionStorage.setItem(`chat-${chat.uuid}-conversation`, data.conversationId);
      }

      // Add assistant response
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
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
  const handleClose = () => {
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