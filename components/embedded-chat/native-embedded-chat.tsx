'use client';

import { BarChart3, Bot, Brain, Briefcase, Calendar, CheckSquare, Code, Database, FileSearch, Globe, Loader2, Mail, MessageSquare, Send, Server, Shield, Sparkles, Terminal, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/use-auth';
import { useUser } from '@/hooks/use-user';
import { cn } from '@/lib/utils';
import { formatVisitorName,getOrCreateVisitorId } from '@/lib/visitor-utils';
import { MemoryList, TaskManager, MemoryDashboard } from '@/components/memory';

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

interface ChatConfig {
  uuid: string;
  name: string;
  welcome_message: string | null;
  suggested_questions: string[];
  theme_config: any;
  position: string;
  offline_config: any;
  bot_avatar_url: string | null;
  expose_capabilities: boolean;
  enable_rag: boolean;
  debug_mode: boolean;
  default_persona?: {
    id: number;
    name: string;
    avatar_url: string | null;
    role: string | null;
    instructions: string;
  } | null;
  mcp_servers?: Array<{
    name: string;
    type: string;
    description: string | null;
  }>;
}

interface ChatCapability {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface NativeEmbeddedChatProps {
  chatUuid: string;
  className?: string;
  position?: 'fixed' | 'relative';
  welcomeMessage?: string;
  placeholder?: string;
  capabilities?: ChatCapability[];
}

// Helper function to get icon for MCP server based on name/type
function getServerIcon(server: { name: string; type: string }) {
  const name = server.name.toLowerCase();
  
  if (name.includes('postgres') || name.includes('mysql') || name.includes('mongo') || name.includes('sql')) {
    return Database;
  }
  if (name.includes('api') || name.includes('http') || name.includes('web')) {
    return Globe;
  }
  if (name.includes('terminal') || name.includes('shell') || name.includes('bash')) {
    return Terminal;
  }
  if (name.includes('code') || name.includes('github') || name.includes('git')) {
    return Code;
  }
  // Default to Server icon
  return Server;
}

// Helper function to get color scheme for server badge
function getServerColorScheme(server: { name: string; type: string }) {
  const name = server.name.toLowerCase();
  
  if (name.includes('postgres') || name.includes('mysql') || name.includes('mongo') || name.includes('sql')) {
    return 'from-blue-500/10 to-purple-500/10 dark:from-blue-500/20 dark:to-purple-500/20 border-blue-500/20 dark:border-blue-400/30 hover:from-blue-500/20 hover:to-purple-500/20 dark:hover:from-blue-500/30 dark:hover:to-purple-500/30';
  }
  if (name.includes('api') || name.includes('http') || name.includes('web')) {
    return 'from-cyan-500/10 to-blue-500/10 dark:from-cyan-500/20 dark:to-blue-500/20 border-cyan-500/20 dark:border-cyan-400/30 hover:from-cyan-500/20 hover:to-blue-500/20 dark:hover:from-cyan-500/30 dark:hover:to-blue-500/30';
  }
  if (name.includes('terminal') || name.includes('shell') || name.includes('bash')) {
    return 'from-gray-500/10 to-slate-500/10 dark:from-gray-500/20 dark:to-slate-500/20 border-gray-500/20 dark:border-gray-400/30 hover:from-gray-500/20 hover:to-slate-500/20 dark:hover:from-gray-500/30 dark:hover:to-slate-500/30';
  }
  if (name.includes('code') || name.includes('github') || name.includes('git')) {
    return 'from-orange-500/10 to-amber-500/10 dark:from-orange-500/20 dark:to-amber-500/20 border-orange-500/20 dark:border-orange-400/30 hover:from-orange-500/20 hover:to-amber-500/20 dark:hover:from-orange-500/30 dark:hover:to-amber-500/30';
  }
  // Default color scheme
  return 'from-indigo-500/10 to-purple-500/10 dark:from-indigo-500/20 dark:to-purple-500/20 border-indigo-500/20 dark:border-indigo-400/30 hover:from-indigo-500/20 hover:to-purple-500/20 dark:hover:from-indigo-500/30 dark:hover:to-purple-500/30';
}

export function NativeEmbeddedChat({
  chatUuid,
  className,
  position = 'fixed',
  welcomeMessage = 'Hi! How can I help you today?',
  placeholder = 'Type your message...',
  capabilities = [],
}: NativeEmbeddedChatProps) {
  const { isAuthenticated, session } = useAuth();
  const { user } = useUser();
  const [isOpen, setIsOpen] = useState(position === 'relative'); // Auto-open for relative position
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [visitorId, setVisitorId] = useState<string>('');
  const [chatConfig, setChatConfig] = useState<ChatConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [showMemories, setShowMemories] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [memories, setMemories] = useState<any[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize visitor ID and fetch chat config
  useEffect(() => {
    const id = getOrCreateVisitorId();
    setVisitorId(id);
    
    // Fetch chat configuration
    const fetchConfig = async () => {
      try {
        const response = await fetch(getApiUrl(`/api/public/chat/${chatUuid}/config`));
        if (response.ok) {
          const data = await response.json();
          console.log('Chat config loaded:', data);
          setChatConfig(data);
        }
      } catch (error) {
        console.error('Failed to fetch chat config:', error);
      } finally {
        setConfigLoading(false);
      }
    };
    
    fetchConfig();
  }, [chatUuid]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Add welcome message when chat opens
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const actualWelcomeMessage = chatConfig?.welcome_message || welcomeMessage;
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: actualWelcomeMessage,
        timestamp: new Date(),
      }]);
    }
  }, [isOpen, welcomeMessage, chatConfig]);

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

  // Fetch memories when conversationId changes or when showMemories is toggled
  useEffect(() => {
    const fetchMemories = async () => {
      if (!conversationId || !showMemories) return;
      
      setMemoriesLoading(true);
      try {
        const response = await fetch(getApiUrl(`/api/embedded-chat/${chatUuid}/conversations/${conversationId}/memories`));
        if (response.ok) {
          const data = await response.json();
          setMemories(data.memories || []);
        } else {
          console.error('Failed to fetch memories:', response.status);
        }
      } catch (error) {
        console.error('Error fetching memories:', error);
      } finally {
        setMemoriesLoading(false);
      }
    };

    fetchMemories();
  }, [conversationId, showMemories, chatUuid]);

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
    
    let debugInfo: any = null;

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
      const assistantMessage: Message = {
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
              console.log('Received data:', data);
              
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
              } else if (data.type === 'tool_start') {
                // Optionally show tool usage in the UI
                console.log('Tool started:', data.tool);
              } else if (data.type === 'tool_end') {
                // Optionally show tool completion
                console.log('Tool ended:', data.tool);
              } else if (data.type === 'debug') {
                // Store debug information
                console.log('Debug info:', data);
                debugInfo = data.metadata;
              } else if (data.type === 'final') {
                // Handle final message if no streaming tokens were received
                if (!assistantMessage.content && data.messages && data.messages.length > 0) {
                  const lastMessage = data.messages[data.messages.length - 1];
                  if (lastMessage.role === 'ai' || lastMessage.role === 'assistant') {
                    assistantMessage.content = lastMessage.content;
                    setMessages(prev => prev.map(msg => 
                      msg.id === assistantMessage.id 
                        ? { ...msg, content: assistantMessage.content }
                        : msg
                    ));
                  }
                }
              } else if (data.type === 'done') {
                // Stream completed
                console.log('Stream completed');
              } else if (data.type === 'conversation') {
                // Handle conversation ID from stream
                if (data.conversation_id && !conversationId) {
                  setConversationId(data.conversation_id);
                }
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
      
      // If no content was received, show a fallback message
      if (!assistantMessage.content) {
        console.warn('No response content received');
        assistantMessage.content = 'I apologize, but I didn\'t receive a proper response. Please try again.';
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessage.id 
            ? { ...msg, content: assistantMessage.content }
            : msg
        ));
      }
      
      // Add debug info to the message if debug mode is enabled
      if (chatConfig?.debug_mode && debugInfo) {
        let debugText = `\n\n---\n📊 Debug: ${debugInfo.provider} ${debugInfo.model}`;
        
        // Show temperature if the model supports it
        if (debugInfo.temperature !== undefined) {
          debugText += ` | Temp: ${debugInfo.temperature}`;
        }
        
        // Show token usage if available
        if (debugInfo.tokens_used) {
          debugText += ` | Tokens Used: ${debugInfo.tokens_used}`;
          if (debugInfo.prompt_tokens && debugInfo.completion_tokens) {
            debugText += ` (Prompt: ${debugInfo.prompt_tokens}, Completion: ${debugInfo.completion_tokens})`;
          }
        } else if (debugInfo.max_tokens) {
          // Fallback to max tokens if consumed tokens not available
          debugText += ` | Max Tokens: ${debugInfo.max_tokens}`;
        }
        
        assistantMessage.content += debugText;
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessage.id 
            ? { ...msg, content: assistantMessage.content }
            : msg
        ));
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

  // Memory handlers
  const handleMemoryDelete = async (memoryId: string) => {
    if (!conversationId) return;
    
    try {
      const response = await fetch(getApiUrl(`/api/embedded-chat/${chatUuid}/conversations/${conversationId}/memories/${memoryId}`), {
        method: 'DELETE',
      });
      
      if (response.ok) {
        // Remove the memory from the local state
        setMemories(prev => prev.filter(memory => memory.id !== memoryId));
      } else {
        console.error('Failed to delete memory:', response.status);
      }
    } catch (error) {
      console.error('Error deleting memory:', error);
    }
  };

  const handleMemoryEdit = async (memoryId: string, updatedMemory: any) => {
    if (!conversationId) return;
    
    try {
      const response = await fetch(getApiUrl(`/api/embedded-chat/${chatUuid}/conversations/${conversationId}/memories/${memoryId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedMemory),
      });
      
      if (response.ok) {
        const data = await response.json();
        // Update the memory in the local state
        setMemories(prev => prev.map(memory =>
          memory.id === memoryId ? data.memory : memory
        ));
      } else {
        console.error('Failed to update memory:', response.status);
      }
    } catch (error) {
      console.error('Error updating memory:', error);
    }
  };

  const renderAvatar = (message: Message) => {
    if (message.role === 'assistant') {
      const avatarUrl = chatConfig?.default_persona?.avatar_url || chatConfig?.bot_avatar_url;
      const avatarName = chatConfig?.default_persona?.name || chatConfig?.name || 'AI Assistant';
      
      if (avatarUrl) {
        return (
          <img 
            src={avatarUrl} 
            alt={avatarName} 
            className="w-8 h-8 rounded-full object-cover"
            onError={(e) => {
              // Fallback to default avatar on error
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              target.parentElement?.insertAdjacentHTML('afterend', 
                '<div class="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-sm font-medium">AI</div>'
              );
            }}
          />
        );
      }
      return (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-sm font-medium">
          {avatarName.substring(0, 2).toUpperCase()}
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
        title="Open chat"
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
          {chatConfig?.bot_avatar_url ? (
            <img
              src={chatConfig.bot_avatar_url}
              alt={chatConfig.name || 'AI Assistant'}
              className="w-8 h-8 rounded-full object-cover border-2 border-white/30"
              onError={(e) => {
                // Fallback to default icon on error
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.parentElement?.insertAdjacentHTML('afterend',
                  '<div class="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4z"/></svg></div>'
                );
              }}
            />
          ) : (
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
          )}
          <div>
            <h3 className="font-semibold">{chatConfig?.name || 'AI Assistant'}</h3>
            <p className="text-xs opacity-90">Online</p>
          </div>
          {isAuthenticated && (
            <Shield className="w-4 h-4 ml-2" title="Authenticated user" />
          )}
        </div>
        <div className="flex items-center space-x-2">
          {conversationId && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowMemories(!showMemories)}
                      className="text-white/80 hover:text-white hover:bg-white/10"
                    >
                      <Brain className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>View conversation memories</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowTasks(!showTasks)}
                      className="text-white/80 hover:text-white hover:bg-white/10"
                    >
                      <CheckSquare className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Manage tasks</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowDashboard(!showDashboard)}
                      className="text-white/80 hover:text-white hover:bg-white/10"
                    >
                      <BarChart3 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Memory dashboard</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
          {position === 'fixed' && (
            <button
              onClick={handleClose}
              className="text-white/80 hover:text-white transition-colors"
              aria-label="Close chat"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 p-4 bg-white dark:bg-gray-800">
        {/* Show MCP capabilities as Discord-style badges */}
        {chatConfig?.expose_capabilities && messages.length <= 1 && (
          <TooltipProvider>
            <div className="mb-4 animate-in fade-in slide-in-from-top-2 duration-500">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-3.5 w-3.5 text-purple-500 dark:text-purple-400 animate-pulse" />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  AI Capabilities
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {/* MCP Server badges */}
                {chatConfig?.mcp_servers && chatConfig.mcp_servers.length > 0 && chatConfig.mcp_servers.map((server, idx) => {
                  const Icon = getServerIcon(server);
                  const colorScheme = getServerColorScheme(server);
                  
                  return (
                    <Tooltip key={idx}>
                      <TooltipTrigger asChild>
                        <div 
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r border rounded-full transition-all cursor-default animate-in fade-in-0 zoom-in-95",
                            colorScheme
                          )}
                          style={{ animationDelay: `${idx * 100}ms`, animationFillMode: 'both' }}
                        >
                          <Icon className="h-3 w-3 text-current opacity-70" />
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                            {server.name}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">
                          {server.description || `${server.type} connection available`}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
                
                {/* RAG badge */}
                {chatConfig?.enable_rag && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div 
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-green-500/10 to-emerald-500/10 dark:from-green-500/20 dark:to-emerald-500/20 border border-green-500/20 dark:border-green-400/30 rounded-full hover:from-green-500/20 hover:to-emerald-500/20 dark:hover:from-green-500/30 dark:hover:to-emerald-500/30 transition-all cursor-default animate-in fade-in-0 zoom-in-95"
                        style={{ animationDelay: `${(chatConfig?.mcp_servers?.length || 0) * 100}ms`, animationFillMode: 'both' }}
                      >
                        <FileSearch className="h-3 w-3 text-green-500 dark:text-green-400" />
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          Document Search
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">
                        Can search and retrieve information from uploaded documents
                      </p>
                    </TooltipContent>
                  </Tooltip>
                )}
                
                {/* Base AI badge - always shown */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div 
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-purple-500/10 to-pink-500/10 dark:from-purple-500/20 dark:to-pink-500/20 border border-purple-500/20 dark:border-purple-400/30 rounded-full hover:from-purple-500/20 hover:to-pink-500/20 dark:hover:from-purple-500/30 dark:hover:to-pink-500/30 transition-all cursor-default animate-in fade-in-0 zoom-in-95"
                      style={{ 
                        animationDelay: `${((chatConfig?.mcp_servers?.length || 0) + (chatConfig?.enable_rag ? 1 : 0)) * 100}ms`, 
                        animationFillMode: 'both' 
                      }}
                    >
                      <Bot className="h-3 w-3 text-purple-500 dark:text-purple-400" />
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        AI Assistant
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">
                      Powered by advanced language models for natural conversations
                    </p>
                  </TooltipContent>
                </Tooltip>
                
                {/* Capability badges from personas */}
                {capabilities && capabilities.length > 0 && capabilities.map((capability, idx) => {
                  const getCategoryIcon = (category: string) => {
                    switch (category) {
                      case 'calendar':
                        return Calendar;
                      case 'communication':
                        return Mail;
                      case 'crm':
                        return Briefcase;
                      case 'support':
                        return Shield;
                      default:
                        return MessageSquare;
                    }
                  };
                  
                  const getCategoryColor = (category: string) => {
                    switch (category) {
                      case 'calendar':
                        return 'from-purple-500/10 to-indigo-500/10 dark:from-purple-500/20 dark:to-indigo-500/20 border-purple-500/20 dark:border-purple-400/30 hover:from-purple-500/20 hover:to-indigo-500/20 dark:hover:from-purple-500/30 dark:hover:to-indigo-500/30';
                      case 'communication':
                        return 'from-green-500/10 to-emerald-500/10 dark:from-green-500/20 dark:to-emerald-500/20 border-green-500/20 dark:border-green-400/30 hover:from-green-500/20 hover:to-emerald-500/20 dark:hover:from-green-500/30 dark:hover:to-emerald-500/30';
                      case 'crm':
                        return 'from-blue-500/10 to-cyan-500/10 dark:from-blue-500/20 dark:to-cyan-500/20 border-blue-500/20 dark:border-blue-400/30 hover:from-blue-500/20 hover:to-cyan-500/20 dark:hover:from-blue-500/30 dark:hover:to-cyan-500/30';
                      case 'support':
                        return 'from-amber-500/10 to-orange-500/10 dark:from-amber-500/20 dark:to-orange-500/20 border-amber-500/20 dark:border-amber-400/30 hover:from-amber-500/20 hover:to-orange-500/20 dark:hover:from-amber-500/30 dark:hover:to-orange-500/30';
                      default:
                        return 'from-gray-500/10 to-slate-500/10 dark:from-gray-500/20 dark:to-slate-500/20 border-gray-500/20 dark:border-gray-400/30 hover:from-gray-500/20 hover:to-slate-500/20 dark:hover:from-gray-500/30 dark:hover:to-slate-500/30';
                    }
                  };
                  
                  const Icon = getCategoryIcon(capability.category);
                  const colorScheme = getCategoryColor(capability.category);
                  const displayName = capability.name.replace('Book ', '').replace('Send ', '').replace('Create ', '');
                  
                  return (
                    <Tooltip key={capability.id}>
                      <TooltipTrigger asChild>
                        <div 
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r border rounded-full transition-all cursor-default animate-in fade-in-0 zoom-in-95",
                            colorScheme
                          )}
                          style={{ 
                            animationDelay: `${((chatConfig?.mcp_servers?.length || 0) + (chatConfig?.enable_rag ? 1 : 0) + 1 + idx) * 100}ms`, 
                            animationFillMode: 'both' 
                          }}
                        >
                          <Icon className="h-3 w-3 text-current opacity-70" />
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                            {displayName}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">
                          {capability.description}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </TooltipProvider>
        )}
        
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

      {/* Memory Panel */}
      {showMemories && conversationId && (
        <div className="border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Brain className="w-4 h-4" />
              Conversation Memories
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMemories(false)}
              className="h-6 w-6 p-0 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
          <div className="max-h-60 overflow-y-auto">
            <MemoryList
              memories={memories}
              className="bg-white dark:bg-gray-800 rounded-lg"
              isLoading={memoriesLoading}
              emptyMessage="No memories found for this conversation."
              onMemoryDelete={handleMemoryDelete}
              onMemoryEdit={handleMemoryEdit}
            />
          </div>
        </div>
      )}

      {/* Task Panel */}
      {showTasks && conversationId && (
        <div className="border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <CheckSquare className="w-4 h-4" />
              Task Manager
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTasks(false)}
              className="h-6 w-6 p-0 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <TaskManager
              chatUuid={chatUuid}
              conversationId={conversationId}
              memories={memories}
              className="bg-white dark:bg-gray-800 rounded-lg"
            />
          </div>
        </div>
      )}

      {/* Memory Dashboard */}
      {showDashboard && conversationId && (
        <div className="border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Memory Dashboard
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDashboard(false)}
              className="h-6 w-6 p-0 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <MemoryDashboard
              chatUuid={chatUuid}
              conversationId={conversationId}
              className="bg-white dark:bg-gray-800 rounded-lg"
            />
          </div>
        </div>
      )}

      <div className="p-4 border-t dark:border-gray-700">
        {/* Show suggested questions if available and conversation just started */}
        {chatConfig?.suggested_questions && chatConfig.suggested_questions.length > 0 && messages.length <= 1 && !inputValue && (
          <div className="mb-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Suggested questions:</div>
            <div className="flex flex-wrap gap-2">
              {chatConfig.suggested_questions.map((question, idx) => (
                <button
                  key={idx}
                  onClick={() => setInputValue(question)}
                  className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full transition-colors text-gray-700 dark:text-gray-300"
                  disabled={isLoading}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}
        
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