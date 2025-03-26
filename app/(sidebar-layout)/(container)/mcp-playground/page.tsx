'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';

import {
  endPlaygroundSession,
  executePlaygroundQuery,
  getOrCreatePlaygroundSession,
} from '@/app/actions/mcp-playground';
import {
  getMcpServers,
  toggleMcpServerStatus,
} from '@/app/actions/mcp-servers';
import {
  getPlaygroundSettings,
  type PlaygroundSettings,
  updatePlaygroundSettings,
} from '@/app/actions/playground-settings';
import { McpServerStatus } from '@/db/schema';
import { useProfiles } from '@/hooks/use-profiles';
import { useToast } from '@/hooks/use-toast';
import { PlaygroundHero } from './components/playground-hero';
import { PlaygroundConfig } from './components/playground-config';
import { PlaygroundChat } from './components/playground-chat';
import { McpServer } from '@/types/mcp-server';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface Message {
  role: string;
  content: string;
  debug?: string;
  timestamp?: Date;
}

interface LogEntry {
  type: 'info' | 'error' | 'connection' | 'execution' | 'response';
  message: string;
  timestamp: Date;
}

interface ServerLogEntry {
  level: string;
  message: string;
  timestamp: Date;
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // State for client logs
  const [clientLogs, setClientLogs] = useState<LogEntry[]>([]);

  // State for server logs
  const [serverLogs, setServerLogs] = useState<ServerLogEntry[]>([]);

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
    type: LogEntry['type'],
    message: string
  ) => {
    setClientLogs((prev) => [
      ...prev,
      { type, message, timestamp: new Date() },
    ]);
  };

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

  // Start session
  const startSession = async () => {
    if (!mcpServers) return;

    // Reset any previous errors
    setSessionError(null);
    
    // Reset server logs
    setServerLogs([]);

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

  // Effect to sync logLevel with llmConfig
  useEffect(() => {
    setLogLevel(llmConfig.logLevel);
  }, [llmConfig.logLevel]);

  // Effect to sync llmConfig with logLevel
  useEffect(() => {
    setLlmConfig(prev => ({
      ...prev,
      logLevel: logLevel
    }));
  }, [logLevel]);

  // Add effect to load settings
  useEffect(() => {
    const loadSettings = async () => {
      if (!profileUuid) return;

      const result = await getPlaygroundSettings(profileUuid);
      if (result.success && result.settings) {
        setLlmConfig({
          provider: result.settings.provider,
          model: result.settings.model,
          temperature: result.settings.temperature,
          maxTokens: result.settings.maxTokens,
          logLevel: result.settings.logLevel,
        });
        setLogLevel(result.settings.logLevel);
      }
    };

    loadSettings();
  }, [profileUuid]);

  // Add save settings function
  const saveSettings = async () => {
    if (!profileUuid) return;

    try {
      addLog('info', 'Saving playground settings...');
      addLog('info', `Config: ${JSON.stringify(llmConfig, null, 2)}`);

      const result = await updatePlaygroundSettings(profileUuid, {
        provider: llmConfig.provider,
        model: llmConfig.model,
        temperature: llmConfig.temperature,
        maxTokens: llmConfig.maxTokens,
        logLevel: llmConfig.logLevel,
      });

      if (result.success) {
        addLog('info', 'Settings saved successfully');
        toast({
          title: 'Settings saved',
          description: 'Your playground settings have been saved successfully.',
        });
      } else {
        addLog('error', `Failed to save settings: ${result.error || 'Unknown error'}`);
        toast({
          title: 'Error saving settings',
          description: result.error || 'An unknown error occurred.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      addLog('error', `Exception saving settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while saving settings.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className='container mx-auto py-6 space-y-6'>
      <PlaygroundHero
        isSessionActive={isSessionActive}
        isProcessing={isProcessing}
        startSession={startSession}
        endSession={endSession}
        mcpServers={mcpServers}
        llmConfig={llmConfig}
      />

      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
        <div>
          <PlaygroundConfig
            isLoading={isLoading}
            mcpServers={mcpServers}
            isSessionActive={isSessionActive}
            isProcessing={isProcessing}
            isUpdatingServer={isUpdatingServer}
            sessionError={sessionError}
            setSessionError={setSessionError}
            toggleServerStatus={toggleServerStatus}
            llmConfig={llmConfig}
            setLlmConfig={setLlmConfig}
            logLevel={logLevel}
            setLogLevel={setLogLevel}
            clientLogs={clientLogs}
            serverLogs={serverLogs}
            clearLogs={() => {
              setClientLogs([]);
              setServerLogs([]);
            }}
            saveSettings={saveSettings}
            logsEndRef={logsEndRef}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
        </div>

        <div className='md:col-span-2'>
          <PlaygroundChat
            messages={messages}
            inputValue={inputValue}
            setInputValue={setInputValue}
            isSessionActive={isSessionActive}
            isProcessing={isProcessing}
            sendMessage={sendMessage}
            startSession={startSession}
            messagesEndRef={messagesEndRef}
            mcpServers={mcpServers}
          />
        </div>
      </div>
    </div>
  );
}
