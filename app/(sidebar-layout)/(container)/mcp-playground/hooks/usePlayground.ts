'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';

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
import {
  getPlaygroundSettings,
  type PlaygroundSettings,
  updatePlaygroundSettings,
} from '@/app/actions/playground-settings';
import { McpServerStatus } from '@/db/schema';
import { useProfiles } from '@/hooks/use-profiles';
import { useToast } from '@/hooks/use-toast';
import { McpServer } from '@/types/mcp-server';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface Message {
  role: string;
  content: string;
  debug?: string;
  timestamp?: Date;
  isPartial?: boolean;
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

export function usePlayground() {
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
    logLevel: 'info', // Default, will be overwritten by fetched settings
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
  const [isThinking, setIsThinking] = useState(false);

  // State for client logs
  const [clientLogs, setClientLogs] = useState<LogEntry[]>([]);

  // State for server logs
  const [serverLogs, setServerLogs] = useState<ServerLogEntry[]>([]);

  // Polling interval for logs when thinking
  const logsPollingRef = useRef<number | null>(null);
  const [pollInterval, setPollInterval] = useState<number>(1000); // Default polling interval
  const lastLogCountRef = useRef<number>(0); // Track number of logs to detect changes

  // Ref for settings throttling
  const updateSettingsThrottledRef = useRef<NodeJS.Timeout | null>(null);

  // User scroll control flag - Keep this in the hook as it affects message updates
  const [userScrollControlled, setUserScrollControlled] = useState(false);

  // Fetch MCP servers
  const {
    data: mcpServersData,
    isLoading: isLoadingServers,
    mutate: mutateServers,
  } = useSWR(profileUuid ? `${profileUuid}/mcp-servers` : null, () =>
    getMcpServers(profileUuid)
  );
  
  // Wrap mcpServers in useMemo to prevent unnecessary re-renders
  const mcpServers = useMemo(() => mcpServersData || [], [mcpServersData]);

  // Fetch Playground Settings
  const {
    data: _playgroundSettingsData,
    isLoading: isLoadingSettings,
    mutate: _mutateSettings,
  } = useSWR(
    profileUuid ? `${profileUuid}/playground-settings` : null,
    () => getPlaygroundSettings(profileUuid),
    {
      onSuccess: (data: { success: boolean; settings?: PlaygroundSettings }) => {
        if (data?.success && data.settings) {
          const newSettings = {
            provider: data.settings.provider,
            model: data.settings.model,
            temperature: data.settings.temperature,
            maxTokens: data.settings.maxTokens,
            logLevel: data.settings.logLevel,
          };
          setLlmConfig(newSettings);
          setLogLevel(data.settings.logLevel);
        }
      },
      onError: (error: unknown) => {
        console.error('Error loading settings:', error);
        addLog(
          'error',
          `Failed to load settings: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      },
    }
  );

  // Combined loading state
  const isLoading = isLoadingServers || isLoadingSettings;

  // Helper to add a log entry
  const addLog = useCallback(
    (type: LogEntry['type'], message: string) => {
      setClientLogs((prev) => [
        ...prev,
        { type, message, timestamp: new Date() },
      ]);
    },
    [] // No dependencies, setClientLogs is stable
  );

  // Modified message update function to prevent automatic scroll
  const updateMessages = useCallback(
    (newMessages: Message[] | ((prev: Message[]) => Message[])) => {
      // Use functional update to avoid closures with outdated state
      setMessages((prev) => {
        // Calculate the new messages
        const updatedMessages =
          typeof newMessages === 'function' ? newMessages(prev) : newMessages;

        // Get current scroll position before DOM update
        const currentScrollY = window.scrollY;

        // After React updates the DOM, reset scroll position using requestAnimationFrame
        // for better timing with browser rendering.
        requestAnimationFrame(() => {
          // Only scroll if the user hasn't taken control
          if (!userScrollControlled) {
             window.scrollTo(0, currentScrollY);
          }
        });

        return updatedMessages;
      });
    },
    [userScrollControlled] // Depends on userScrollControlled
  );

  // Helper to create polling interval with specific delay, wrapped in useCallback
  const createPollingInterval = useCallback(
    (interval: number) => {
      logsPollingRef.current = window.setInterval(async () => {
        if (!profileUuid || !isSessionActive) {
          return;
        }

        try {
          const result = await getServerLogs(profileUuid);
          if (result.success && result.logs) {
            // Detect if number of logs has changed
            const newLogCount = result.logs.length;
            const logsDelta = newLogCount - lastLogCountRef.current;
            lastLogCountRef.current = newLogCount;

            // Adapt polling rate based on activity
            if (isThinking) {
              if (logsDelta > 5) setPollInterval((prev) => Math.max(200, prev - 50));
              else if (logsDelta === 0) setPollInterval((prev) => Math.min(500, prev + 50));
            } else if (logsDelta > 0) {
              setPollInterval((prev) => Math.max(750, prev - 50));
            } else {
              setPollInterval((prev) => Math.min(2000, prev + 100));
            }

            setServerLogs(result.logs);

            // Handle streaming message if available
            if (result.hasPartialMessage) {
              const streamingLog = result.logs.find(
                (log) =>
                  log.level === 'streaming' &&
                  log.message.includes('"isPartial":true')
              );

              if (streamingLog?.message) {
                try {
                  const partialMessage = JSON.parse(streamingLog.message);
                  if (partialMessage.isPartial) {
                    updateMessages((prev) => {
                      const hasPartialMessage = prev.some((m) => m.isPartial);
                      return hasPartialMessage
                        ? prev.map((m) => (m.isPartial ? partialMessage : m))
                        : [...prev, partialMessage];
                    });
                  }
                } catch (e) {
                  console.error('Failed to parse streaming message', e);
                }
              }
            }
          }
        } catch (error) {
          console.error('Failed to poll server logs:', error);
          setPollInterval((prev) => Math.min(3000, prev + 500));
        }
      }, interval);
    },
    [profileUuid, isSessionActive, isThinking, updateMessages] // Added updateMessages dependency
  );

  // Start polling for server logs with adaptive intervals
  const startLogPolling = useCallback(() => {
    if (logsPollingRef.current) {
      clearInterval(logsPollingRef.current);
      logsPollingRef.current = null;
    }
    const initialInterval = isThinking ? 250 : 1000;
    setPollInterval(initialInterval);
    createPollingInterval(initialInterval);
  }, [isThinking, createPollingInterval]);

  // Stop polling for server logs
  const stopLogPolling = useCallback(() => {
    if (logsPollingRef.current) {
      clearInterval(logsPollingRef.current);
      logsPollingRef.current = null;
    }
  }, []);

  // Apply polling interval changes
  useEffect(() => {
    if (isSessionActive && logsPollingRef.current) {
      clearInterval(logsPollingRef.current);
      logsPollingRef.current = null;
      createPollingInterval(pollInterval);
    }
  }, [pollInterval, isSessionActive, createPollingInterval]); // Added createPollingInterval

  // Toggle server status
  const toggleServerStatus = useCallback(
    async (serverUuid: string, status: boolean) => {
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
        await mutateServers(); // Re-fetch server list
      } catch (error) {
        console.error('Error toggling server status:', error);
        const msg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Failed to update server status: ${msg}`);
        toast({
          title: 'Error',
          description: 'Failed to update server status.',
          variant: 'destructive',
        });
      } finally {
        setIsUpdatingServer(null);
      }
    },
    [profileUuid, addLog, mutateServers, toast]
  );

  // Start session
  const startSession = useCallback(async () => {
    if (!mcpServers) return;

    setSessionError(null);
    setServerLogs([]);
    setClientLogs([]); // Clear client logs too

    const activeServerUuids = mcpServers
      .filter((server: McpServer) => server.status === McpServerStatus.ACTIVE)
      .map((server: McpServer) => server.uuid);

    if (activeServerUuids.length === 0) {
      toast({
        title: 'Error',
        description: 'Please activate at least one MCP server.',
        variant: 'destructive',
      });
      addLog('error', 'Failed to start session: No active MCP servers.');
      return;
    }

    addLog('info', 'Initiating MCP playground session...');
    addLog('info', `Attempting to connect ${activeServerUuids.length} server(s)...`);
    addLog(
      'info',
      `LLM config: ${llmConfig.provider} ${llmConfig.model} (temp: ${llmConfig.temperature})`
    );
    addLog('info', `Log level: ${logLevel}`);
    startLogPolling(); // Start polling immediately

    try {
      setIsProcessing(true);
      const sessionPromise = getOrCreatePlaygroundSession(
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

      const result = await sessionPromise;

      if (result.success) {
        setIsSessionActive(true);
        updateMessages([]); // Clear chat messages
        addLog('connection', 'MCP playground session active.');
        toast({
          title: 'Success',
          description: 'MCP playground session started.',
        });
      } else {
        stopLogPolling();
        const errorMessage = result.error || 'Unknown error';
        addLog('error', `Failed to start session: ${errorMessage}`);
        setSessionError(errorMessage);
        toast({
          title: 'Error starting session',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    } catch (error) {
      stopLogPolling();
      console.error('Failed to start session:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLog('error', `Exception during session start: ${errorMessage}`);
      setSessionError(errorMessage);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred during session start.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  }, [
    profileUuid,
    mcpServers,
    llmConfig,
    logLevel,
    addLog,
    startLogPolling,
    stopLogPolling,
    toast,
    updateMessages, // Added updateMessages
  ]);

  // End session
  const endSession = useCallback(async () => {
    if (!profileUuid) return;
    try {
      setIsProcessing(true);
      addLog('info', 'Ending MCP playground session...');
      stopLogPolling();

      const result = await endPlaygroundSession(profileUuid);

      if (result.success) {
        setIsSessionActive(false);
        setServerLogs([]);
        addLog('connection', 'MCP playground session ended successfully.');
        toast({
          title: 'Success',
          description: 'MCP playground session ended.',
        });
      } else {
        const msg = result.error || 'Unknown error';
        addLog('error', `Failed to end session: ${msg}`);
        toast({
          title: 'Error',
          description: msg,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to end session:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      addLog('error', `Exception: ${msg}`);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  }, [profileUuid, addLog, stopLogPolling, toast]);

  // Send message
  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || !isSessionActive || !profileUuid) return;

    try {
      setIsProcessing(true);
      setIsThinking(true);

      const scrollPosition = window.scrollY;
      const userMessage = {
        role: 'human',
        content: inputValue,
        timestamp: new Date(),
      };

      updateMessages((prev) => [...prev, userMessage]);
      setInputValue('');
      setTimeout(() => window.scrollTo(0, scrollPosition), 0); // Restore scroll

      addLog('execution', `Executing query: "${userMessage.content}"`);
      stopLogPolling(); // Restart polling with potentially faster interval
      startLogPolling();

      const result = await executePlaygroundQuery(profileUuid, userMessage.content);

      if (result.success) {
        addLog('response', 'Query executed successfully');
        if (result.debug) {
          addLog(
            'info',
            `Messages: ${result.debug.messageCount}, Last content type: ${result.debug.lastMessageContentType}`
          );
        }

        if (result.messages) {
          const currentMessageContents = messages.map((m) => m.content);
          const newMessages = result.messages.filter(
            (m: any) => !currentMessageContents.includes(m.content)
          );

          if (newMessages.length > 0) {
            const scrollPos = window.scrollY;
            const timestampedMessages = newMessages.map((m: any) => ({
              ...m,
              timestamp: new Date(),
            }));
            updateMessages((prev) => [...prev, ...timestampedMessages]);
            setTimeout(() => window.scrollTo(0, scrollPos), 0); // Restore scroll

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
        const msg = result.error || 'Unknown error';
        addLog('error', `Failed to execute query: ${msg}`);
        toast({ title: 'Error', description: msg, variant: 'destructive' });
        updateMessages((prev) => [
          ...prev,
          { role: 'ai', content: `Error: ${msg}`, timestamp: new Date() },
        ]);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      addLog('error', `Exception: ${msg}`);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
      updateMessages((prev) => [
        ...prev,
        { role: 'ai', content: `Error: ${msg}`, timestamp: new Date() },
      ]);
    } finally {
      setIsProcessing(false);
      setIsThinking(false);
      stopLogPolling(); // Restart polling with normal interval
      startLogPolling();
    }
  }, [
    inputValue,
    isSessionActive,
    profileUuid,
    addLog,
    stopLogPolling,
    startLogPolling,
    toast,
    messages, // Need current messages to filter duplicates
    updateMessages, // Added updateMessages
  ]);

  // Save settings with debounce
  const saveSettings = useCallback(async () => {
    if (!profileUuid) return;

    try {
      addLog('info', 'Saving playground settings...');
      if (updateSettingsThrottledRef.current) {
        clearTimeout(updateSettingsThrottledRef.current);
      }

      updateSettingsThrottledRef.current = setTimeout(async () => {
        try {
          // Ensure llmConfig includes logLevel before saving
          const settingsToSave = { ...llmConfig, logLevel };
          const result = await updatePlaygroundSettings(profileUuid, settingsToSave);

          if (result.success) {
            addLog('info', 'Settings saved successfully');
            // Optionally mutate settings if needed, though SWR handles revalidation
            // mutateSettings();
          } else {
            const msg = result.error || 'Unknown error';
            addLog('error', `Failed to save settings: ${msg}`);
          }
          updateSettingsThrottledRef.current = null;
        } catch (error) {
          console.error('Failed to save settings:', error);
          const msg = error instanceof Error ? error.message : 'Unknown error';
          addLog('error', `Exception saving settings: ${msg}`);
          updateSettingsThrottledRef.current = null;
        }
      }, 1500);
    } catch (error) {
      // This catch block might be redundant as the async operation is inside setTimeout
      console.error('Error initiating settings save:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      addLog('error', `Exception initiating settings save: ${msg}`);
    }
  }, [profileUuid, llmConfig, logLevel, addLog]); // Added logLevel dependency

  // Effect to update llmConfig's logLevel when the separate logLevel state changes
  useEffect(() => {
    setLlmConfig(prev => ({ ...prev, logLevel: logLevel }));
  }, [logLevel]);


  // Cleanup effect for all timers
  useEffect(() => {
    return () => {
      if (logsPollingRef.current) clearInterval(logsPollingRef.current);
      if (updateSettingsThrottledRef.current) clearTimeout(updateSettingsThrottledRef.current);
    };
  }, []);

  // Scroll guard effect - Keep this in the hook
  useEffect(() => {
    const scrollGuard = (e: Event) => {
      if (e.target !== document && e.target !== window) return;
      const lastScroll = window.scrollY;
      setTimeout(() => {
        if (window.scrollY !== lastScroll && !userScrollControlled) {
          window.scrollTo(0, lastScroll);
        }
      }, 100);
    };
    window.addEventListener('scroll', scrollGuard, { passive: true });
    return () => window.removeEventListener('scroll', scrollGuard);
  }, [userScrollControlled]);

  return {
    // State
    activeTab,
    setActiveTab,
    logLevel,
    setLogLevel,
    llmConfig,
    setLlmConfig,
    isUpdatingServer,
    sessionError,
    setSessionError,
    isSessionActive,
    messages,
    inputValue,
    setInputValue,
    isProcessing,
    isThinking,
    clientLogs,
    setClientLogs, // Expose setter for clearing logs
    serverLogs,
    setServerLogs, // Expose setter for clearing logs
    userScrollControlled,
    setUserScrollControlled, // Expose setter for scroll control

    // Derived State / Data
    isLoading,
    mcpServers,

    // Refs
    messagesEndRef,
    logsEndRef,

    // Functions
    toggleServerStatus,
    startSession,
    endSession,
    sendMessage,
    saveSettings,
    addLog, // Expose if needed externally, though unlikely
  };
}
