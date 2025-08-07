'use client';

import { format } from 'date-fns';
import { 
  Bot,
  ChevronLeft,
  ChevronRight,
  Send, 
  User,
  UserCircle,
  X
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface Message {
  id: number;
  conversation_uuid: string;
  role: 'user' | 'assistant' | 'system' | 'human' | 'instruction';
  content: string;
  created_by?: 'ai' | 'human' | 'system';
  human_user_id?: string;
  is_internal?: boolean;
  created_at: Date;
}

interface Conversation {
  uuid: string;
  visitor_id: string;
  visitor_name?: string;
  visitor_email?: string;
  status: 'active' | 'waiting' | 'human_controlled' | 'ended';
  started_at: Date;
  page_url?: string;
  metadata?: any;
}

interface AgentChatInterfaceProps {
  conversation: Conversation;
  messages: Message[];
  chatUuid: string;
  onClose: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function AgentChatInterface({ 
  conversation,
  messages: initialMessages,
  chatUuid,
  onClose,
  isCollapsed = false,
  onToggleCollapse
}: AgentChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [newMessage, setNewMessage] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Poll for new messages every 2 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/embedded-chat/${chatUuid}/conversations/${conversation.uuid}/messages`);
        if (response.ok) {
          const data = await response.json();
          setMessages(data.messages || []);
        }
      } catch (error) {
        console.error('Failed to fetch messages:', error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [chatUuid, conversation.uuid]);

  const sendMessage = async (content: string, isInternal = false) => {
    if (!content.trim() || isSending) return;

    setIsSending(true);
    try {
      const response = await fetch(`/api/embedded-chat/${chatUuid}/conversations/${conversation.uuid}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: content.trim(),
          role: 'human',
          created_by: 'human',
          is_internal: isInternal,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const result = await response.json();
      
      // Add the new message to our local state
      setMessages(prev => [...prev, result.message]);
      
      // Clear the input
      if (isInternal) {
        setInternalNote('');
      } else {
        setNewMessage('');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const releaseConversation = async () => {
    try {
      const response = await fetch(`/api/embedded-chat/${chatUuid}/takeover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: conversation.uuid,
          action: 'release',
          reason: 'Manual release from agent interface',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to release conversation');
      }

      onClose();
    } catch (error) {
      console.error('Failed to release conversation:', error);
    }
  };

  const getMessageIcon = (message: Message) => {
    if (message.role === 'user') return <User className="h-4 w-4" />;
    if (message.role === 'human') return <UserCircle className="h-4 w-4" />;
    return <Bot className="h-4 w-4" />;
  };

  const getMessageStyle = (message: Message) => {
    if (message.is_internal) return 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200';
    if (message.role === 'system') return 'bg-blue-50 dark:bg-blue-950/20 border-blue-200';
    if (message.role === 'human') return 'bg-purple-50 dark:bg-purple-950/20 border-purple-200';
    return '';
  };

  if (isCollapsed) {
    return (
      <Card className="fixed bottom-4 right-4 w-80 z-50 shadow-lg">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">
              Chat with {conversation.visitor_name || `Visitor ${conversation.visitor_id.slice(0, 8)}`}
            </CardTitle>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={onToggleCollapse}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Click to expand chat interface
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 w-96 h-[600px] z-50 shadow-lg flex flex-col">
      {/* Header */}
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">
              Live Chat: {conversation.visitor_name || `Visitor ${conversation.visitor_id.slice(0, 8)}`}
            </CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="default" className="bg-blue-500 text-xs">
                Human Controlled
              </Badge>
              {conversation.visitor_email && (
                <span className="text-xs text-muted-foreground">{conversation.visitor_email}</span>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={onToggleCollapse}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* Messages */}
      <CardContent className="flex-1 flex flex-col min-h-0 p-0">
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex gap-2',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.role !== 'user' && (
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarFallback className="text-xs">
                      {getMessageIcon(message)}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg p-2 space-y-1',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted',
                    getMessageStyle(message)
                  )}
                >
                  <div className="flex items-center gap-1 text-xs opacity-70">
                    <span className="capitalize">{message.role}</span>
                    {message.is_internal && (
                      <Badge variant="outline" className="text-xs">Internal</Badge>
                    )}
                    <span>{format(new Date(message.created_at), 'HH:mm')}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
                {message.role === 'user' && (
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarFallback className="text-xs">
                      <User className="h-3 w-3" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            {isTyping && (
              <div className="flex gap-2 justify-start">
                <Avatar className="h-6 w-6 shrink-0">
                  <AvatarFallback className="text-xs">
                    <Bot className="h-3 w-3" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-lg p-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t p-3 space-y-2">
          {/* Customer Message Input */}
          <div className="flex gap-2">
            <Input
              placeholder="Type message to customer..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(newMessage);
                }
              }}
              disabled={isSending}
            />
            <Button 
              size="sm" 
              onClick={() => sendMessage(newMessage)}
              disabled={!newMessage.trim() || isSending}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

          {/* Internal Note Input */}
          <div className="flex gap-2">
            <Textarea
              placeholder="Add internal note..."
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              className="min-h-[60px] text-xs"
              disabled={isSending}
            />
            <Button 
              size="sm"
              variant="outline" 
              onClick={() => sendMessage(internalNote, true)}
              disabled={!internalNote.trim() || isSending}
              className="self-end"
            >
              Note
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between pt-2">
            <Button variant="outline" size="sm" onClick={releaseConversation}>
              Release to AI
            </Button>
            <span className="text-xs text-muted-foreground self-center">
              Press Enter to send
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}