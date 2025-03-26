'use client';

import {
  Activity,
  Code,
  Play,
  Power,
  Save,
  Send,
  Server,
  Settings,
  Terminal,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { McpToolsLogger } from '@h1deya/langchain-mcp-tools';

import {
  endPlaygroundSession,
  executePlaygroundQuery,
  getOrCreatePlaygroundSession,
  getServerLogs,
} from '@/app/actions/mcp-playground';
import {
  getMcpServers,
  toggleMcpServerStatus,
} from '@/app/actions/mcp-servers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { McpServerStatus } from '@/db/schema';
import { useProfiles } from '@/hooks/use-profiles';
import { useToast } from '@/hooks/use-toast';
import { McpServer } from '@/types/mcp-server';
import {
  getPlaygroundSettings,
  updatePlaygroundSettings,
  type PlaygroundSettings,
} from '@/app/actions/playground-settings';

// Define log level type
type LogLevel = 'error' | 'warn' | 'info' | 'debug';

// Custom logger class for MCP tools (now used only for local UI display)
class ClientLogger implements McpToolsLogger {
  constructor(
    private readonly addLogCallback: (type: 'info' | 'error' | 'connection' | 'execution' | 'response', message: string) => void,
    private readonly logLevel: LogLevel
  ) {}

  private shouldLog(level: LogLevel): boolean {
    const levels: { [key in LogLevel]: number } = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
    return levels[this.logLevel] >= levels[level];
  }

  debug(...args: unknown[]) {
    if (this.shouldLog('debug')) {
      this.addLogCallback('info', `[DEBUG] ${args.map(arg => String(arg)).join(' ')}`);
    }
  }

  info(...args: unknown[]) {
    if (this.shouldLog('info')) {
      this.addLogCallback('info', args.map(arg => String(arg)).join(' '));
    }
  }

  warn(...args: unknown[]) {
    if (this.shouldLog('warn')) {
      this.addLogCallback('connection', `[WARN] ${args.map(arg => String(arg)).join(' ')}`);
    }
  }

  error(...args: unknown[]) {
    if (this.shouldLog('error')) {
      this.addLogCallback('error', args.map(arg => String(arg)).join(' '));
    }
  }
}

export default function McpPlaygroundPage() {
  const { toast } = useToast();
  const { currentProfile } = useProfiles();
  const profileUuid = currentProfile?.uuid || '';
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // State for active tab
  const [activeTab, setActiveTab] = useState('servers');
  
  // State for log level
  const [logLevel, setLogLevel] = useState<LogLevel>('info');

  // State for LLM configuration
  const [llmConfig, setLlmConfig] = useState<PlaygroundSettings>({
    provider: 'anthropic',
    model: 'claude-3-7-sonnet-20250219',
    temperature: 0,
    maxTokens: 1000,
    logLevel: 'info',
  });

  // State for selected servers (will now use active servers instead of selection)
  const [isUpdatingServer, setIsUpdatingServer] = useState<string | null>(null);

  // State for session errors
  const [sessionError, setSessionError] = useState<string | null>(null);

  // State for session
  const [isSessionActive, setIsSessionActive] = useState(false);

  // State for chat
  const [messages, setMessages] = useState<
    {
      role: string;
      content: string;
      debug?: string;
      timestamp?: Date;
    }[]
  >([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // State for client logs
  const [clientLogs, setClientLogs] = useState<
    {
      type: 'info' | 'error' | 'connection' | 'execution' | 'response';
      message: string;
      timestamp: Date;
    }[]
  >([]);

  // State for server logs
  const [serverLogs, setServerLogs] = useState<
    {
      level: string;
      message: string;
      timestamp: Date;
    }[]
  >([]);
  
  // Last processed server log timestamp
  const [lastServerLogTimestamp, setLastServerLogTimestamp] = useState<Date | null>(null);

  // Auto scroll to bottom of messages and logs
  useEffect(() => {
    // Function to smoothly scroll to bottom if we're already near the bottom
    const scrollToBottomIfNearBottom = (ref: React.RefObject<HTMLDivElement>) => {
      if (ref.current) {
        const container = ref.current.parentElement;
        if (container) {
          // Check if we're already scrolled near the bottom
          const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
          
          // If we're near the bottom, scroll to bottom smoothly
          if (isNearBottom) {
            ref.current.scrollIntoView({ behavior: 'smooth' });
          }
        }
      }
    };
    
    // Handle message scroll
    if (messagesEndRef.current) {
      scrollToBottomIfNearBottom(messagesEndRef);
    }
    
    // Handle logs scroll
    if (logsEndRef.current) {
      scrollToBottomIfNearBottom(logsEndRef);
    }
  }, [messages, clientLogs, serverLogs]);

  // Auto scroll when tab changes to logs
  useEffect(() => {
    if (activeTab === 'logs' && logsEndRef.current) {
      setTimeout(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [activeTab]);

  // Helper to add a log entry
  const addLog = (
    type: 'info' | 'error' | 'connection' | 'execution' | 'response',
    message: string
  ) => {
    setClientLogs((prev) => [
      ...prev,
      { type, message, timestamp: new Date() },
    ]);
  };
  
  // Poll for server logs when session is active
  useEffect(() => {
    if (!isSessionActive || !profileUuid) return;
    
    let isPolling = false;
    
    const fetchServerLogs = async () => {
      if (isPolling) return; // Prevent parallel requests
      
      try {
        isPolling = true;
        const result = await getServerLogs(profileUuid);
        if (result.success && result.logs) {
          // Filter logs that are newer than the last one we processed
          let newLogs = result.logs;
          if (lastServerLogTimestamp) {
            newLogs = result.logs.filter(log => 
              new Date(log.timestamp) > lastServerLogTimestamp
            );
          }
          
          if (newLogs.length > 0) {
            // Process new logs, sort them by timestamp to ensure correct order
            const sortedNewLogs = [...newLogs].sort((a, b) => 
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
            
            // Update server logs state
            setServerLogs(prev => [...prev, ...sortedNewLogs]);
            
            // Update last processed timestamp
            const latestTimestamp = new Date(Math.max(
              ...newLogs.map(log => new Date(log.timestamp).getTime())
            ));
            setLastServerLogTimestamp(latestTimestamp);
          }
        }
      } catch (error) {
        console.error('Error fetching server logs:', error);
      } finally {
        isPolling = false;
      }
    };
    
    // Fetch logs immediately
    fetchServerLogs();
    
    // Then fetch every 500ms for a more streaming-like experience
    const interval = setInterval(fetchServerLogs, 500);
    
    return () => clearInterval(interval);
  }, [isSessionActive, profileUuid, lastServerLogTimestamp]);

  // Fetch MCP servers
  const {
    data: mcpServers,
    isLoading,
    mutate,
  } = useSWR(profileUuid ? `${profileUuid}/mcp-servers` : null, () =>
    getMcpServers(profileUuid)
  );

  // Toggle server status
  const toggleServerStatus = async (serverUuid: string, status: boolean) => {
    if (!profileUuid) return;

    try {
      setIsUpdatingServer(serverUuid);
      addLog(
        'info',
        `Toggling server ${serverUuid} status to ${status ? 'ACTIVE' : 'INACTIVE'}...`
      );

      await toggleMcpServerStatus(
        profileUuid,
        serverUuid,
        status ? McpServerStatus.ACTIVE : McpServerStatus.INACTIVE
      );

      addLog('connection', `Server status updated successfully`);
      await mutate();
    } catch (error) {
      console.error('Error toggling server status:', error);
      addLog(
        'error',
        `Failed to update server status: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      toast({
        title: 'Error',
        description: 'Failed to update server status.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingServer(null);
    }
  };

  // Start session - update to use active servers instead of selected servers
  const startSession = async () => {
    if (!mcpServers) return;

    // Reset any previous errors
    setSessionError(null);
    
    // Reset server logs
    setServerLogs([]);
    setLastServerLogTimestamp(null);

    // Filter only ACTIVE servers
    const activeServerUuids = mcpServers
      .filter((server) => server.status === 'ACTIVE')
      .map((server) => server.uuid);

    if (activeServerUuids.length === 0) {
      toast({
        title: 'Error',
        description: 'Please activate at least one MCP server.',
        variant: 'destructive',
      });
      addLog('error', 'Failed to start session: No active MCP servers.');
      return;
    }

    try {
      setIsProcessing(true);
      addLog('info', 'Starting MCP playground session...');
      addLog('info', `Active servers: ${activeServerUuids.length}`);
      addLog(
        'info',
        `LLM config: ${llmConfig.provider} ${llmConfig.model} (temp: ${llmConfig.temperature})`
      );
      addLog('info', `Log level: ${logLevel}`);

      const result = await getOrCreatePlaygroundSession(
        profileUuid,
        activeServerUuids,
        {
          provider: llmConfig.provider as 'openai' | 'anthropic',
          model: llmConfig.model,
          temperature: llmConfig.temperature,
          maxTokens: llmConfig.maxTokens,
          logLevel: logLevel,
        }
      );

      if (result.success) {
        setIsSessionActive(true);
        setMessages([]);
        
        // Switch to logs tab to show server initialization
        setActiveTab('logs');
        
        // Add immediate feedback logs to let users see activity right away
        addLog('connection', 'MCP playground session started successfully.');
        addLog('info', 'Initializing MCP servers and tools...');
        addLog('info', 'Connecting to language model...');
        
        // Add logs for each active server
        const activeServers =
          mcpServers.filter((server) =>
            activeServerUuids.includes(server.uuid)
          ) || [];
        activeServers.forEach((server) => {
          addLog(
            'connection',
            `Connected to "${server.name} (${server.type})"`
          );
        });

        toast({
          title: 'Success',
          description: 'MCP playground session started.',
        });
      } else {
        const errorMessage = result.error || 'Unknown error';
        addLog('error', `Failed to start session: ${errorMessage}`);
        setSessionError(errorMessage);
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to start session:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLog('error', `Exception: ${errorMessage}`);
      setSessionError(errorMessage);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // End session
  const endSession = async () => {
    try {
      setIsProcessing(true);
      addLog('info', 'Ending MCP playground session...');

      const result = await endPlaygroundSession(profileUuid);

      if (result.success) {
        setIsSessionActive(false);
        // Reset server logs state when session ends
        setServerLogs([]);
        setLastServerLogTimestamp(null);
        addLog('connection', 'MCP playground session ended successfully.');
        toast({
          title: 'Success',
          description: 'MCP playground session ended.',
        });
      } else {
        addLog(
          'error',
          `Failed to end session: ${result.error || 'Unknown error'}`
        );
        toast({
          title: 'Error',
          description: result.error || 'Failed to end session.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to end session:', error);
      addLog(
        'error',
        `Exception: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!inputValue.trim() || !isSessionActive) return;

    try {
      setIsProcessing(true);

      // Add user message
      const userMessage = {
        role: 'human',
        content: inputValue,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInputValue('');

      addLog('execution', `Executing query: "${userMessage.content}"`);

      // Execute query
      const result = await executePlaygroundQuery(
        profileUuid,
        userMessage.content
      );

      if (result.success) {
        addLog('response', 'Query executed successfully');

        // Log debug information
        if (result.debug) {
          addLog(
            'info',
            `Messages: ${result.debug.messageCount}, Last content type: ${result.debug.lastMessageContentType}`
          );
        }

        // Add all messages from the result
        if (result.messages) {
          // Filter out messages we already have
          const currentMessageContents = messages.map((m) => m.content);
          const newMessages = result.messages.filter(
            (m: any) => !currentMessageContents.includes(m.content)
          );

          if (newMessages.length > 0) {
            // Add timestamp to each message
            const timestampedMessages = newMessages.map((m: any) => ({
              ...m,
              timestamp: new Date(),
            }));

            setMessages((prev) => [...prev, ...timestampedMessages]);

            // Log tool messages separately
            timestampedMessages.forEach((msg: any) => {
              if (msg.role === 'tool') {
                addLog(
                  'execution',
                  `Tool execution: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`
                );
              }
            });
          }
        }
      } else {
        addLog(
          'error',
          `Failed to execute query: ${result.error || 'Unknown error'}`
        );
        toast({
          title: 'Error',
          description: result.error || 'Failed to execute query.',
          variant: 'destructive',
        });
        // Add error message to chat
        setMessages((prev) => [
          ...prev,
          {
            role: 'ai',
            content: `Error: ${result.error || 'Failed to execute query.'}`,
            timestamp: new Date(),
          },
        ]);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      addLog(
        'error',
        `Exception: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
      // Add error message to chat
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          content: 'An unexpected error occurred.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Add effect to load settings
  useEffect(() => {
    const loadSettings = async () => {
      if (!profileUuid) return;

      const result = await getPlaygroundSettings(profileUuid);
      if (result.success && result.data) {
        setLlmConfig({
          provider: result.data.provider,
          model: result.data.model,
          temperature: result.data.temperature,
          maxTokens: result.data.maxTokens,
          logLevel: result.data.logLevel,
        });
      }
    };

    loadSettings();
  }, [profileUuid]);

  // Add save settings function
  const saveSettings = async () => {
    if (!profileUuid) return;

    const result = await updatePlaygroundSettings(profileUuid, {
      provider: llmConfig.provider,
      model: llmConfig.model,
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.maxTokens,
      logLevel: llmConfig.logLevel,
    });

    if (result.success) {
      toast({
        title: 'Settings saved',
        description: 'Your playground settings have been saved successfully.',
      });
    } else {
      toast({
        title: 'Error saving settings',
        description: result.error || 'An unknown error occurred.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className='container mx-auto py-6 space-y-6'>
      {/* Hero Section */}
      <Card className='bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border-0 shadow-md overflow-hidden'>
        <CardContent className='p-6 md:p-8'>
          <div className='flex flex-col md:flex-row items-start md:items-center justify-between'>
            <div className='space-y-2'>
              <h1 className='text-2xl md:text-3xl font-bold tracking-tight'>
                Playground
              </h1>
              <p className='text-muted-foreground max-w-2xl'>
                Test your MCP servers with powerful LLMs. Configure server
                connections, adjust model settings, and interact using natural
                language to see your tools in action.
              </p>
            </div>
            <div className='mt-4 md:mt-0'>
              {!isSessionActive ? (
                <Button
                  size='lg'
                  className='bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700'
                  onClick={startSession}
                  disabled={
                    isProcessing ||
                    mcpServers?.filter((s) => s.status === 'ACTIVE').length ===
                      0
                  }>
                  {isProcessing ? (
                    <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  ) : (
                    <Play className='w-4 h-4 mr-2' />
                  )}
                  {isProcessing ? 'Starting...' : 'Start Playground'}
                </Button>
              ) : (
                <Button
                  size='lg'
                  variant='destructive'
                  onClick={endSession}
                  disabled={isProcessing}>
                  {isProcessing ? (
                    <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  ) : (
                    <Power className='w-4 h-4 mr-2' />
                  )}
                  {isProcessing ? 'Ending...' : 'End Session'}
                </Button>
              )}
            </div>
          </div>

          {/* Session Status Indicator */}
          {isSessionActive && (
            <div className='mt-6 flex items-center'>
              <Badge
                variant='outline'
                className='bg-green-500/10 text-green-700 border-green-200 flex items-center gap-1.5'>
                <Activity className='h-3 w-3' />
                Session Active
              </Badge>
              <Separator orientation='vertical' className='mx-3 h-4' />
              <div className='text-sm text-muted-foreground flex items-center gap-1.5'>
                <Server className='h-3.5 w-3.5' />
                {mcpServers?.filter((s) => s.status === 'ACTIVE').length ||
                  0}{' '}
                {mcpServers?.filter((s) => s.status === 'ACTIVE').length === 1
                  ? 'server'
                  : 'servers'}{' '}
                connected
              </div>
              <Separator orientation='vertical' className='mx-3 h-4' />
              <div className='text-sm text-muted-foreground flex items-center gap-1.5'>
                <Code className='h-3.5 w-3.5' />
                {llmConfig.provider}: {llmConfig.model}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
        {/* Configuration Panel */}
        <div>
          <Card className='shadow-sm'>
            <CardHeader className='pb-3'>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>
                Configure the LLM and select MCP servers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue='servers' value={activeTab} onValueChange={setActiveTab}>
                <TabsList className='grid w-full grid-cols-3'>
                  <TabsTrigger value='servers'>Servers</TabsTrigger>
                  <TabsTrigger value='llm'>Model</TabsTrigger>
                  <TabsTrigger value='logs' className="relative">
                    Logs
                    {isSessionActive && (
                      <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    )}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value='servers' className='space-y-4 mt-4'>
                  {isLoading ? (
                    <div className='flex items-center justify-center py-8'>
                      <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
                    </div>
                  ) : mcpServers?.length === 0 ? (
                    <div className='text-center p-6 bg-muted/50 rounded-lg'>
                      <Server className='h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50' />
                      <p className='text-muted-foreground font-medium'>
                        No MCP servers configured.
                      </p>
                      <Button
                        variant='link'
                        className='mt-2'
                        onClick={() => (window.location.href = '/mcp-servers')}>
                        Go to MCP Servers
                      </Button>
                    </div>
                  ) : (
                    <div className='space-y-3'>
                      {sessionError && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-md mb-4">
                          <div className="flex items-start">
                            <div className="flex-shrink-0 text-red-500">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                              </svg>
                            </div>
                            <div className="ml-3">
                              <h3 className="text-sm font-medium text-red-800">Session Error</h3>
                              <div className="mt-1 text-sm text-red-700">
                                {sessionError}
                              </div>
                              <div className="mt-2">
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="text-xs"
                                  onClick={() => setSessionError(null)}
                                >
                                  Dismiss
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      {mcpServers?.map((server: McpServer) => (
                        <TooltipProvider key={server.uuid}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={`flex items-center justify-between p-2.5 rounded-md transition-colors ${
                                  server.status === 'ACTIVE'
                                    ? 'bg-secondary/50'
                                    : 'hover:bg-muted/50'
                                }`}>
                                <div className='flex-1'>
                                  <div className='flex items-center'>
                                    <div className='font-medium'>
                                      {server.name}
                                    </div>
                                    {server.status === 'ACTIVE' ? (
                                      <Badge
                                        variant='outline'
                                        className='ml-2 bg-green-500/10 text-green-700 border-green-200'>
                                        Active
                                      </Badge>
                                    ) : (
                                      <Badge
                                        variant='outline'
                                        className='ml-2 bg-amber-500/10 text-amber-700 border-amber-200'>
                                        Inactive
                                      </Badge>
                                    )}
                                  </div>
                                  <div className='text-sm text-muted-foreground flex items-center'>
                                    <Badge
                                      variant='secondary'
                                      className='mr-1.5 py-0 px-1.5 h-5 font-normal'>
                                      {server.type}
                                    </Badge>
                                    {server.description && server.description}
                                  </div>
                                </div>
                                <Switch
                                  checked={server.status === 'ACTIVE'}
                                  onCheckedChange={(checked) =>
                                    toggleServerStatus(server.uuid, checked)
                                  }
                                  disabled={
                                    isSessionActive ||
                                    isUpdatingServer === server.uuid
                                  }
                                  className='ml-2'
                                />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side='right'>
                              <div className='space-y-1 max-w-xs'>
                                <p className='font-medium'>{server.name}</p>
                                <p className='text-xs'>{server.description}</p>
                                <div className='text-xs flex items-center space-x-1'>
                                  <span>Type:</span>
                                  <Badge
                                    variant='secondary'
                                    className='py-0 px-1.5 h-4 font-normal'>
                                    {server.type}
                                  </Badge>
                                </div>
                                {server.command && (
                                  <p className='text-xs'>
                                    Command: {server.command}
                                  </p>
                                )}
                                {server.url && (
                                  <p className='text-xs'>URL: {server.url}</p>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ))}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value='llm' className='space-y-4 mt-4'>
                  <div className='flex items-center justify-between mb-4'>
                    <div className='bg-muted/30 p-4 rounded-lg flex-1'>
                      <div className='text-sm font-medium mb-2'>Selected Model</div>
                      <div className='flex items-center'>
                        <Badge className='bg-primary/10 text-primary border-primary/20 py-1.5 px-3'>
                          {llmConfig.provider === 'anthropic' ? 'Anthropic' : 'OpenAI'}
                        </Badge>
                        <Separator orientation='vertical' className='mx-3 h-5' />
                        <div className='text-sm font-medium'>{llmConfig.model}</div>
                      </div>
                    </div>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={saveSettings}
                      disabled={isSessionActive}>
                      <Save className='mr-2 h-4 w-4' />
                      Save Settings
                    </Button>
                  </div>

                  <div className='space-y-4'>
                    <div>
                      <Label htmlFor='provider' className='text-sm font-medium'>
                        Provider
                      </Label>
                      <Select
                        value={llmConfig.provider}
                        onValueChange={(value) =>
                          setLlmConfig({ ...llmConfig, provider: value as 'anthropic' | 'openai' })
                        }
                        disabled={isSessionActive}>
                        <SelectTrigger className='mt-1.5'>
                          <SelectValue placeholder='Select provider' />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='anthropic'>Anthropic</SelectItem>
                          <SelectItem value='openai'>OpenAI</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor='model' className='text-sm font-medium'>
                        Model
                      </Label>
                      <Select
                        value={llmConfig.model}
                        onValueChange={(value) =>
                          setLlmConfig({ ...llmConfig, model: value })
                        }
                        disabled={isSessionActive}>
                        <SelectTrigger className='mt-1.5'>
                          <SelectValue placeholder='Select model' />
                        </SelectTrigger>
                        <SelectContent>
                          {llmConfig.provider === 'anthropic' ? (
                            <>
                              <SelectItem value='claude-3-7-sonnet-20250219'>
                                Claude 3.7 Sonnet
                              </SelectItem>
                              <SelectItem value='claude-3-5-sonnet-20240620'>
                                Claude 3.5 Sonnet
                              </SelectItem>
                              <SelectItem value='claude-3-opus-20240229'>
                                Claude 3 Opus
                              </SelectItem>
                              <SelectItem value='claude-3-sonnet-20240229'>
                                Claude 3 Sonnet
                              </SelectItem>
                              <SelectItem value='claude-3-haiku-20240307'>
                                Claude 3 Haiku
                              </SelectItem>
                            </>
                          ) : (
                            <>
                              <SelectItem value='gpt-4o-2024-05-13'>
                                GPT-4o
                              </SelectItem>
                              <SelectItem value='gpt-4o-mini-2024-07-18'>
                                GPT-4o Mini
                              </SelectItem>
                              <SelectItem value='gpt-4-turbo-2024-04-09'>
                                GPT-4 Turbo
                              </SelectItem>
                              <SelectItem value='gpt-3.5-turbo-0125'>
                                GPT-3.5 Turbo
                              </SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <div className='flex justify-between items-center'>
                        <Label
                          htmlFor='temperature'
                          className='text-sm font-medium'>
                          Temperature
                        </Label>
                        <span className='text-sm text-muted-foreground'>
                          {llmConfig.temperature}
                        </span>
                      </div>
                      <Input
                        id='temperature'
                        type='range'
                        min='0'
                        max='1'
                        step='0.1'
                        value={llmConfig.temperature}
                        onChange={(e) =>
                          setLlmConfig({
                            ...llmConfig,
                            temperature: parseFloat(e.target.value),
                          })
                        }
                        disabled={isSessionActive}
                        className='mt-1.5'
                      />
                      <div className='flex justify-between text-xs text-muted-foreground mt-1'>
                        <span>Precise</span>
                        <span>Creative</span>
                      </div>
                    </div>

                    <div>
                      <div className='flex justify-between items-center'>
                        <Label
                          htmlFor='maxTokens'
                          className='text-sm font-medium'>
                          Max Tokens
                        </Label>
                        <span className='text-sm text-muted-foreground'>
                          {llmConfig.maxTokens}
                        </span>
                      </div>
                      <Input
                        id='maxTokens'
                        type='range'
                        min='100'
                        max='4000'
                        step='100'
                        value={llmConfig.maxTokens}
                        onChange={(e) =>
                          setLlmConfig({
                            ...llmConfig,
                            maxTokens: parseInt(e.target.value),
                          })
                        }
                        disabled={isSessionActive}
                        className='mt-1.5'
                      />
                    </div>

                    <div>
                      <Label htmlFor='logLevel' className='text-sm font-medium'>
                        Log Level
                      </Label>
                      <Select
                        value={llmConfig.logLevel}
                        onValueChange={(value) =>
                          setLlmConfig({ ...llmConfig, logLevel: value as 'debug' | 'info' | 'warn' | 'error' })
                        }
                        disabled={isSessionActive}>
                        <SelectTrigger className='mt-1.5'>
                          <SelectValue placeholder='Select log level' />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='debug'>Debug</SelectItem>
                          <SelectItem value='info'>Info</SelectItem>
                          <SelectItem value='warn'>Warn</SelectItem>
                          <SelectItem value='error'>Error</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value='logs' className='space-y-4 mt-4'>
                  <div className='flex items-center justify-between mb-4'>
                    <div className='text-sm font-medium flex items-center'>
                      <Terminal className='w-4 h-4 mr-1.5' />
                      MCP Client Logs
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={saveSettings}
                        disabled={isSessionActive}
                        className='h-7 text-xs'>
                        <Save className='h-3 w-3 mr-1' />
                        Save Settings
                      </Button>
                      {(clientLogs.length > 0 || serverLogs.length > 0) && (
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() => {
                            setClientLogs([]);
                            setServerLogs([]);
                          }}
                          className='h-7 text-xs'>
                          Clear
                        </Button>
                      )}
                      <div className="flex bg-secondary rounded-md p-0.5">
                        {['error', 'warn', 'info', 'debug'].map((level) => (
                          <Button
                            key={level}
                            size="sm"
                            variant={logLevel === level ? 'secondary' : 'ghost'}
                            className={`h-6 text-xs px-2 capitalize ${
                              logLevel === level ? 'bg-background shadow-sm' : ''
                            } ${
                              level === 'error' ? 'text-red-500 hover:text-red-600' : 
                              level === 'warn' ? 'text-amber-500 hover:text-amber-600' : 
                              level === 'debug' ? 'text-blue-500 hover:text-blue-600' : 
                              'text-green-500 hover:text-green-600'
                            }`}
                            onClick={() => setLogLevel(level as LogLevel)}
                          >
                            {level}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  {sessionError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md mb-4">
                      <div className="flex items-start">
                        <div className="flex-shrink-0 text-red-500">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                          </svg>
                        </div>
                        <div className="ml-3 flex-1">
                          <h3 className="text-sm font-medium text-red-800">Session Error</h3>
                          <div className="mt-1 text-sm text-red-700">
                            {sessionError}
                          </div>
                          <div className="mt-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="text-xs"
                              onClick={() => setSessionError(null)}
                            >
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <ScrollArea className='h-[calc(100vh-24rem)] border rounded-md bg-muted/20'>
                    <div className="px-3 pt-2 pb-1 text-xs text-muted-foreground border-b border-muted-foreground/10">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${
                              logLevel === 'error' ? 'bg-red-500' : 
                              logLevel === 'warn' ? 'bg-amber-500' : 
                              logLevel === 'debug' ? 'bg-blue-500' : 
                              'bg-green-500'
                            }`}></div>
                            <span>Showing {logLevel} and above logs</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Log levels: error {'<'} warn {'<'} info {'<'} debug</p>
                            <p className="text-xs mt-1">Higher levels include all lower levels</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className='p-3 font-mono text-xs space-y-1.5'>
                      {clientLogs.length === 0 && serverLogs.length === 0 ? (
                        <div className='text-muted-foreground text-center py-8'>
                          No logs available. Start a session to see logs.
                        </div>
                      ) : (
                        // Combine and sort client and server logs by timestamp
                        [...clientLogs.map(log => ({
                          source: 'client' as const,
                          type: log.type,
                          message: log.message,
                          timestamp: log.timestamp,
                          level: log.type === 'error' ? 'error' :
                                 log.type === 'connection' ? 'warn' :
                                 log.type === 'info' ? 'info' :
                                 'info'
                        })),
                        ...serverLogs.map(log => ({
                          source: 'server' as const,
                          type: 'info',
                          message: log.message,
                          timestamp: log.timestamp,
                          level: log.level
                        }))]
                          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
                          // Filter logs based on log level
                          .filter(log => {
                            // Special handling for logs with prefixes
                            if (log.message.startsWith('[DEBUG]')) {
                              return logLevel === 'debug';
                            }
                            if (log.message.startsWith('[WARN]')) {
                              return ['warn', 'info', 'debug'].includes(logLevel);
                            }
                            
                            const levels: { [key in LogLevel]: number } = {
                              error: 0,
                              warn: 1,
                              info: 2,
                              debug: 3
                            };
                            
                            const currentLogLevel = log.level || 'info';
                            return levels[logLevel] >= levels[currentLogLevel as LogLevel];
                          })
                          .map((log, index) => (
                            <div key={index} className='flex'>
                              <div className='text-muted-foreground mr-2'>
                                [{log.timestamp.toLocaleTimeString()}]
                              </div>
                              <div
                                className={`
                                ${log.source === 'server' ? 'text-violet-500' : ''}
                                ${log.type === 'info' ? 'text-blue-500' : ''}
                                ${log.type === 'error' ? 'text-red-500' : ''}
                                ${log.type === 'connection' ? 'text-green-500' : ''}
                                ${log.type === 'execution' ? 'text-amber-500' : ''}
                                ${log.type === 'response' ? 'text-purple-500' : ''}
                              `}>
                                {log.message.startsWith('[DEBUG]') ? (
                                  <span className="text-blue-400">[DEBUG]</span>
                                ) : log.message.startsWith('[WARN]') ? (
                                  <span className="text-amber-400">[WARN]</span>
                                ) : log.source === 'server' ? (
                                  <span className="text-violet-400">[SERVER:{log.level.toUpperCase()}]</span>
                                ) : (
                                  <span>[{log.type.toUpperCase()}]</span>
                                )}{' '}
                                {log.message.startsWith('[DEBUG]') ? 
                                  log.message.substring(7) : 
                                  log.message.startsWith('[WARN]') ?
                                  log.message.substring(6) :
                                  log.message}
                              </div>
                            </div>
                          ))
                      )}
                      
                      {/* Live indicator when session is active */}
                      {isSessionActive && (
                        <div className='flex items-center text-muted-foreground mt-2'>
                          <div className='h-1.5 w-1.5 rounded-full bg-green-500 mr-2 animate-pulse'></div>
                          <span className='text-xs italic'>Streaming logs...</span>
                        </div>
                      )}
                      
                      <div ref={logsEndRef} />
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Chat Interface */}
        <div className='md:col-span-2'>
          <Card className='flex flex-col h-[calc(100vh-12rem)] shadow-sm'>
            <CardHeader className='pb-3'>
              <CardTitle>Chat Interface</CardTitle>
              <CardDescription>
                Test your MCP servers with natural language
              </CardDescription>
            </CardHeader>
            <CardContent className='flex-1 overflow-hidden'>
              <ScrollArea className='h-[calc(100vh-20rem)] pr-4'>
                {messages.length === 0 ? (
                  <div className='flex flex-col items-center justify-center h-full text-center p-8'>
                    <div className='bg-muted/30 rounded-full p-4 mb-4'>
                      <Settings className='h-10 w-10 text-primary/40' />
                    </div>
                    <h3 className='text-lg font-medium mb-2'>MCP Playground</h3>
                    <p className='text-muted-foreground max-w-md'>
                      {isSessionActive
                        ? 'Ask questions or give instructions to test your MCP servers. Try exploring what tools are available or request specific actions.'
                        : 'Select MCP servers and start a session to begin testing your tools with natural language.'}
                    </p>
                    {!isSessionActive && (
                      <Button
                        className='mt-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700'
                        onClick={startSession}
                        disabled={
                          isProcessing ||
                          mcpServers?.filter((s) => s.status === 'ACTIVE')
                            .length === 0
                        }>
                        {isProcessing ? (
                          <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                        ) : (
                          <Play className='w-4 h-4 mr-2' />
                        )}
                        {isProcessing ? 'Starting...' : 'Start Session'}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className='space-y-4 pb-1'>
                    {messages.map((message, index) => (
                      <div
                        key={index}
                        className={`flex ${
                          message.role === 'human'
                            ? 'justify-end'
                            : 'justify-start'
                        }`}>
                        <div
                          className={`rounded-lg p-3 max-w-[90%] ${
                            message.role === 'human'
                              ? 'bg-primary text-primary-foreground ml-4'
                              : message.role === 'tool'
                                ? 'bg-muted/80 border border-muted-foreground/10'
                                : 'bg-secondary'
                          }`}>
                          {message.timestamp && (
                            <div className='text-xs text-muted-foreground/70 mb-1'>
                              {message.timestamp.toLocaleTimeString()}
                            </div>
                          )}

                          {message.role === 'tool' && (
                            <div className='text-xs text-muted-foreground mb-1 flex items-center'>
                              <Code className='h-3 w-3 mr-1' />
                              Tool Execution
                            </div>
                          )}

                          <div className='whitespace-pre-wrap'>
                            {typeof message.content === 'string'
                              ? message.content
                              : 'Complex content (see console)'}
                          </div>

                          {message.debug && (
                            <details className='mt-1 text-xs opacity-50'>
                              <summary className='cursor-pointer hover:text-primary'>
                                Debug Info
                              </summary>
                              <div className='p-1 mt-1 bg-black/10 rounded'>
                                {message.debug}
                              </div>
                            </details>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>
            </CardContent>
            <Separator />
            <CardFooter className='p-4'>
              <div className='flex w-full items-center space-x-2'>
                <Textarea
                  placeholder={
                    isSessionActive
                      ? 'Type your message...'
                      : 'Start a session to begin chatting'
                  }
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  disabled={!isSessionActive || isProcessing}
                  className='flex-1 min-h-10 resize-none bg-background border-muted-foreground/20'
                />
                <Button
                  size='icon'
                  onClick={sendMessage}
                  disabled={
                    !isSessionActive || !inputValue.trim() || isProcessing
                  }
                  className={`transition-all ${isProcessing ? 'animate-pulse' : ''}`}>
                  <Send className='h-4 w-4' />
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
