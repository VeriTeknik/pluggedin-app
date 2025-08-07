'use client';

import { format } from 'date-fns';
import {
  Bot,
  Copy,
  Download,
  Edit,
  FileText,
  Image,
  Loader2,
  MoreVertical,
  Paperclip,
  RotateCcw,
  Send,
  Settings,
  Upload,
  User,
  X,
} from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Types
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    model?: string;
    tokens?: number;
    attachments?: FileAttachment[];
  };
  status?: 'sending' | 'sent' | 'error';
}

interface FileAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
  data?: string; // base64 for small files
}

interface ChatConfig {
  chatUuid: string;
  apiKey?: string;
  visitorInfo?: {
    visitor_id: string;
    name?: string;
    email?: string;
  };
  authenticatedUser?: {
    id: string;
    name: string;
    avatar?: string;
  };
  customSystemPrompt?: string;
  appearance?: {
    primaryColor?: string;
    botAvatar?: string;
    position?: 'bottom-right' | 'bottom-left' | 'bottom-center';
  };
}

interface EnhancedChatWidgetProps {
  config: ChatConfig;
  onMessage?: (message: Message) => void;
  className?: string;
  height?: string;
  initialInput?: string;
  onInputChange?: (value: string) => void;
}

export interface EnhancedChatWidgetRef {
  sendMessage: (content: string) => void;
  setInputValue: (value: string) => void;
  clearMessages: () => void;
}

export const EnhancedChatWidget = forwardRef<EnhancedChatWidgetRef, EnhancedChatWidgetProps>(({
  config,
  onMessage,
  className,
  height = "500px",
  initialInput = "",
  onInputChange
}, ref) => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState(initialInput);
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(config.customSystemPrompt || '');
  const [editingMessage, setEditingMessage] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // File upload with drag & drop
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newAttachments: FileAttachment[] = acceptedFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      type: file.type,
      size: file.size,
    }));

    // Handle small files (< 1MB) by converting to base64
    acceptedFiles.forEach((file, index) => {
      if (file.size < 1024 * 1024) {
        const reader = new FileReader();
        reader.onload = () => {
          newAttachments[index].data = reader.result as string;
          setAttachments(prev => [...prev, ...newAttachments]);
        };
        reader.readAsDataURL(file);
      } else {
        // For larger files, you'd typically upload to a server first
        setAttachments(prev => [...prev, ...newAttachments]);
      }
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/*': ['.txt', '.md', '.json'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
      'application/pdf': ['.pdf'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  // Send message function
  const sendMessage = useCallback(async (content: string, isRegeneration = false, originalMessageId?: string) => {
    if (!content.trim() && attachments.length === 0) return;

    const messageId = Math.random().toString(36).substr(2, 9);
    const userMessage: Message = {
      id: messageId,
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
      metadata: attachments.length > 0 ? { attachments } : undefined,
      status: 'sending'
    };

    // Add user message to state (unless it's a regeneration)
    if (!isRegeneration) {
      setMessages(prev => [...prev, userMessage]);
      onMessage?.(userMessage);
    }

    setInputValue('');
    setAttachments([]);
    setIsLoading(true);
    setIsTyping(true);

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      const requestBody = {
        message: content,
        conversation_id: conversationId,
        visitor_info: config.visitorInfo || {
          visitor_id: 'anonymous-' + Date.now(),
        },
        authenticated_user: config.authenticatedUser,
        custom_system_prompt: customPrompt,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      const response = await fetch(`/api/public/chat/${config.chatUuid}/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      const assistantMessageId = Math.random().toString(36).substr(2, 9);
      let assistantContent = '';
      let hasStartedResponse = false;

      if (!reader) {
        throw new Error('No response body');
      }

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
                setConversationId(data.conversation_id);
              } else if (data.type === 'content' || data.type === 'text') {
                if (!hasStartedResponse) {
                  // Create assistant message on first content
                  const assistantMessage: Message = {
                    id: assistantMessageId,
                    role: 'assistant',
                    content: data.content,
                    timestamp: new Date(),
                    metadata: { model: 'AI Assistant' }
                  };
                  
                  if (isRegeneration && originalMessageId) {
                    // Replace the original message
                    setMessages(prev => prev.map(msg => 
                      msg.id === originalMessageId ? assistantMessage : msg
                    ));
                  } else {
                    setMessages(prev => [...prev, assistantMessage]);
                  }
                  
                  hasStartedResponse = true;
                  assistantContent = data.content;
                } else {
                  // Update existing message
                  assistantContent += data.content;
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessageId 
                      ? { ...msg, content: assistantContent }
                      : msg
                  ));
                }
              } else if (data.type === 'tool_call') {
                // Show tool usage
                toast({
                  title: "Tool Usage",
                  description: `Using: ${data.content}`,
                  duration: 2000,
                });
              } else if (data.type === 'error') {
                throw new Error(data.content);
              }
            } catch (e) {
              console.error('Failed to parse streaming data:', e);
            }
          }
        }
      }

      // Mark user message as sent
      if (!isRegeneration) {
        setMessages(prev => prev.map(msg => 
          msg.id === messageId ? { ...msg, status: 'sent' } : msg
        ));
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        return; // Request was cancelled
      }

      console.error('Send message error:', error);
      
      const errorMessage = error.message || 'Failed to send message';
      
      // Mark user message as error (if not regeneration)
      if (!isRegeneration) {
        setMessages(prev => prev.map(msg => 
          msg.id === messageId ? { ...msg, status: 'error' } : msg
        ));
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsTyping(false);
      abortControllerRef.current = null;
    }
  }, [config, conversationId, customPrompt, attachments, onMessage, toast]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    sendMessage: (content: string) => sendMessage(content),
    setInputValue: (value: string) => setInputValue(value),
    clearMessages: () => setMessages([])
  }), [sendMessage]);

  // Handle input value changes
  const handleInputChange = (value: string) => {
    setInputValue(value);
    onInputChange?.(value);
  };

  // Handle initial input
  useEffect(() => {
    setInputValue(initialInput);
  }, [initialInput]);

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  // Message actions
  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({ title: "Copied", description: "Message copied to clipboard" });
  };

  const startEdit = (message: Message) => {
    setEditingMessage(message.id);
    setEditContent(message.content);
  };

  const saveEdit = (messageId: string) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, content: editContent } : msg
    ));
    setEditingMessage(null);
    setEditContent('');
    toast({ title: "Updated", description: "Message updated successfully" });
  };

  const regenerateResponse = (messageId: string) => {
    const messageIndex = messages.findIndex(msg => msg.id === messageId);
    if (messageIndex > 0) {
      const previousMessage = messages[messageIndex - 1];
      if (previousMessage.role === 'user') {
        sendMessage(previousMessage.content, true, messageId);
      }
    }
  };

  // Export conversation
  const exportConversation = () => {
    const exportData = {
      conversation_id: conversationId,
      exported_at: new Date().toISOString(),
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
        metadata: msg.metadata
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-${format(new Date(), 'yyyy-MM-dd-HH-mm')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import conversation
  const importConversation = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.messages && Array.isArray(data.messages)) {
          const importedMessages: Message[] = data.messages.map((msg: any, index: number) => ({
            id: `imported-${index}`,
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.timestamp),
            metadata: msg.metadata
          }));
          setMessages(importedMessages);
          setConversationId(data.conversation_id || null);
          toast({ title: "Success", description: "Conversation imported successfully" });
        }
      } catch (error) {
        toast({ 
          title: "Error", 
          description: "Failed to import conversation",
          variant: "destructive"
        });
      }
    };
    reader.readAsText(file);
  };

  // Typing indicator component
  const TypingIndicator = () => (
    <div className="flex items-center space-x-2 p-3">
      <Avatar className="h-8 w-8">
        <AvatarImage src={config.appearance?.botAvatar} />
        <AvatarFallback><Bot className="h-4 w-4" /></AvatarFallback>
      </Avatar>
      <div className="bg-muted rounded-lg px-3 py-2">
        <div className="flex space-x-1">
          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );

  // Message component with enhanced formatting
  const MessageComponent = ({ message }: { message: Message }) => {
    const isUser = message.role === 'user';
    const isEditing = editingMessage === message.id;

    return (
      <div className={cn("flex gap-3 p-3", isUser ? "justify-end" : "justify-start")}>
        {!isUser && (
          <Avatar className="h-8 w-8">
            <AvatarImage src={config.appearance?.botAvatar} />
            <AvatarFallback><Bot className="h-4 w-4" /></AvatarFallback>
          </Avatar>
        )}
        
        <div className={cn("max-w-[80%] space-y-2", isUser ? "items-end" : "items-start")}>
          <div className={cn(
            "rounded-lg px-3 py-2 break-words",
            isUser 
              ? "bg-primary text-primary-foreground ml-auto" 
              : "bg-muted"
          )}>
            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="min-h-[60px]"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveEdit(message.id)}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingMessage(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {message.role === 'assistant' ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        const isInline = !match;
                        
                        if (isInline) {
                          return (
                            <code className="bg-muted px-1 py-0.5 rounded text-sm" {...props}>
                              {children}
                            </code>
                          );
                        }
                        
                        return (
                          <pre className="bg-slate-900 text-slate-100 rounded p-4 text-sm overflow-x-auto">
                            <code className={className} {...props}>
                              {String(children).replace(/\n$/, '')}
                            </code>
                          </pre>
                        );
                      },
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                ) : (
                  <div className="whitespace-pre-wrap">{message.content}</div>
                )}
                
                {/* Attachments */}
                {message.metadata?.attachments && (
                  <div className="space-y-2 mt-2">
                    {message.metadata.attachments.map((attachment) => (
                      <div key={attachment.id} className="flex items-center gap-2 text-sm">
                        {attachment.type.startsWith('image/') ? (
                          <Image className="h-4 w-4" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                        <span>{attachment.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {(attachment.size / 1024).toFixed(1)}KB
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{format(message.timestamp, 'HH:mm')}</span>
            {message.status === 'sending' && <Loader2 className="h-3 w-3 animate-spin" />}
            {message.status === 'error' && <Badge variant="destructive" className="text-xs">Error</Badge>}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => copyMessage(message.content)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </DropdownMenuItem>
                {isUser && (
                  <DropdownMenuItem onClick={() => startEdit(message)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                )}
                {!isUser && (
                  <DropdownMenuItem onClick={() => regenerateResponse(message.id)}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Regenerate
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        
        {isUser && (
          <Avatar className="h-8 w-8">
            <AvatarImage src={config.authenticatedUser?.avatar} />
            <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
          </Avatar>
        )}
      </div>
    );
  };

  return (
    <Card className={cn("flex flex-col", className)} style={{ height }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">AI Assistant</CardTitle>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowSettings(true)}>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={exportConversation}>
                  <Download className="h-4 w-4 mr-2" />
                  Export Conversation
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Upload className="h-4 w-4 mr-2" />
                  <Label htmlFor="import-conversation" className="cursor-pointer">
                    Import Conversation
                  </Label>
                  <input
                    id="import-conversation"
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={importConversation}
                    aria-label="Import conversation file"
                  />
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setMessages([])}>
                  Clear Chat
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0">
        {/* Messages */}
        <ScrollArea className="flex-1 px-4">
          <div className="space-y-1">
            {messages.map((message) => (
              <MessageComponent key={message.id} message={message} />
            ))}
            {isTyping && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
        
        <Separator />
        
        {/* File attachments preview */}
        {attachments.length > 0 && (
          <div className="p-3 border-t bg-muted/50">
            <div className="flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="flex items-center gap-2 bg-background rounded px-2 py-1 text-sm">
                  {attachment.type.startsWith('image/') ? (
                    <Image className="h-4 w-4" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  <span className="truncate max-w-[100px]">{attachment.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0"
                    onClick={() => setAttachments(prev => prev.filter(a => a.id !== attachment.id))}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Input area */}
        <div className="p-3">
          <div
            {...getRootProps()}
            className={cn(
              "relative",
              isDragActive && "ring-2 ring-primary ring-offset-2 rounded-md"
            )}
          >
            {/* Hidden file input for dropzone */}
            <input {...getInputProps()} ref={fileInputRef} />
            
            <form onSubmit={handleSubmit} className="flex gap-2">
              <div className="flex-1 relative">
                <Input
                  value={inputValue}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder={isDragActive ? "Drop files here..." : "Type your message..."}
                  disabled={isLoading}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </div>
              
              <Button
                type="submit"
                disabled={(!inputValue.trim() && attachments.length === 0) || isLoading}
                size="sm"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </div>
        </div>
      </CardContent>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chat Settings</DialogTitle>
            <DialogDescription>
              Customize your chat experience
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Custom System Prompt</Label>
              <Textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Enter custom instructions for the AI..."
                className="min-h-[100px]"
              />
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSettings(false)}>
                Cancel
              </Button>
              <Button onClick={() => setShowSettings(false)}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
});

EnhancedChatWidget.displayName = 'EnhancedChatWidget';