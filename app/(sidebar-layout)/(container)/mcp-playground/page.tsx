'use client';

import { useCallback, useEffect, useRef, useState } from 'react'; // Import useCallback
import useSWR from 'swr';

import {
  endPlaygroundSession,
  executePlaygroundQuery,
  getOrCreatePlaygroundSession,
  getServerLogs
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

import { PlaygroundChat } from './components/playground-chat';
import { PlaygroundConfig } from './components/playground-config';
import { PlaygroundHero } from './components/playground-hero';

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
  }, [messages, clientLogs, serverLogs, isThinking]);

  // Auto scroll when tab changes to logs
  useEffect(() => {
    if (activeTab === 'logs' && logsEndRef.current) {
      // First scroll immediately to improve responsiveness
      logsEndRef.current.scrollIntoView();
      
      // Then do a smooth scroll after a short delay to ensure content is loaded
      setTimeout(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [activeTab]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      // Temizlik işlemlerini yap
      if (logsPollingRef.current) {
        clearInterval(logsPollingRef.current);
      }
    };
  }, []);

  // Update polling when thinking state changes
  useEffect(() => {
    if (isSessionActive) {
      // Adjust polling interval based on thinking state
      setPollInterval(isThinking ? 250 : 1000);
    }
  }, [isThinking, isSessionActive]);

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

  // Start polling for server logs with adaptive intervals
  const startLogPolling = () => {
    // Clear any existing interval first
    if (logsPollingRef.current) {
      clearInterval(logsPollingRef.current);
      logsPollingRef.current = null;
    }
    
    // Start with appropriate interval based on current state
    const initialInterval = isThinking ? 250 : 1000;
    setPollInterval(initialInterval);
    
    // Create and store new polling interval
    createPollingInterval(initialInterval);
  };

  // Helper to create polling interval with specific delay, wrapped in useCallback
  const createPollingInterval = useCallback((interval: number) => {
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
                      // When thinking, use more frequent updates
                      if (logsDelta > 5) {
                        // Lots of new logs - poll more frequently (up to 200ms)
                        setPollInterval(prev => Math.max(200, prev - 50));
                      } else if (logsDelta === 0) {
                        // No new logs - gradually slow down (up to 500ms when thinking)
                        setPollInterval(prev => Math.min(500, prev + 50));
                      }
                    }
          else if (logsDelta > 0) {
                        // Some activity - poll more frequently
                        setPollInterval(prev => Math.max(750, prev - 50));
                      }
          else {
                        // No activity - gradually slow down (up to 2000ms when idle)
                        setPollInterval(prev => Math.min(2000, prev + 100));
                      }
          
          // Update logs
          setServerLogs(result.logs);

          // Handle streaming message if available
          if (result.hasPartialMessage) {
            const streamingLog = result.logs.find(log => 
              log.level === 'streaming' && 
              log.message.includes('"isPartial":true')
            );
            
            if (streamingLog && streamingLog.message) {
              try {
                const partialMessage = JSON.parse(streamingLog.message);
                if (partialMessage.isPartial) {
                  // Update current message or add new one
                  setMessages(prev => {
                    // Check if we already have a partial message
                    const hasPartialMessage = prev.some(m => m.isPartial);
                    
                    if (hasPartialMessage) {
                      // Replace the existing partial message
                      return prev.map(m => 
                        m.isPartial ? partialMessage : m
                      );
                    } else {
                      // Add the partial message
                      return [...prev, partialMessage];
                    }
                  });
                }
              } catch (e) {
                console.error('Failed to parse streaming message', e);
              }
            }
          }

          // Update scroll if needed
          if (logsEndRef.current && activeTab === 'logs') {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
          }
        }
      } catch (error) {
        console.error('Failed to poll server logs:', error);
        // Slow down polling on errors
        setPollInterval(prev => Math.min(3000, prev + 500));
      }
    }, interval);
  }, [profileUuid, isSessionActive, isThinking, activeTab, setPollInterval, setServerLogs, setMessages, logsEndRef, lastLogCountRef]); // Add dependencies for useCallback

  // Stop polling for server logs
  const stopLogPolling = () => {
    if (logsPollingRef.current) {
      clearInterval(logsPollingRef.current);
      logsPollingRef.current = null;
    }
  };

  // Apply polling interval changes
  useEffect(() => {
    // Only update if we have an active session and the interval has changed
    if (isSessionActive && logsPollingRef.current) {
      // Clear existing interval
      clearInterval(logsPollingRef.current);
      logsPollingRef.current = null;
      
      // Create new interval with updated polling rate
      createPollingInterval(pollInterval);
    }
    // Removed unnecessary eslint-disable comment
  }, [pollInterval, isSessionActive, profileUuid, createPollingInterval]); // Add createPollingInterval to dependencies

  // Cleanup effect
  useEffect(() => {
    return () => {
      // Clean up interval when component unmounts
      if (logsPollingRef.current) {
        clearInterval(logsPollingRef.current);
        logsPollingRef.current = null;
      }
    };
  }, []);

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
    if (!profileUuid) {
      return;
    }

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
    if (!mcpServers) {
      return;
    }

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

    // --- Start Polling Immediately ---
    // Reset logs and start polling *before* awaiting the session creation
    setServerLogs([]);
    setClientLogs([]); // Also clear client logs for a fresh start
    addLog('info', 'Initiating MCP playground session...');
    addLog('info', `Attempting to connect ${activeServerUuids.length} server(s)...`);
    addLog(
        'info',
        `LLM config: ${llmConfig.provider} ${llmConfig.model} (temp: ${llmConfig.temperature})`
      );
      addLog('info', `Log level: ${logLevel}`);
      setActiveTab('logs'); // Switch to logs tab immediately
      startLogPolling(); // Start polling now

    try {
      setIsProcessing(true); // Keep processing state until session is confirmed or fails

      // Initiate session creation but don't await here yet
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

      // Now await the promise and handle the result
      const result = await sessionPromise;

      if (result.success) {
        setIsSessionActive(true);
        setMessages([]); // Clear chat messages on successful session start
        addLog('connection', 'MCP playground session active.'); // Confirmation log
        toast({
          title: 'Success',
          description: 'MCP playground session started.',
        });
      } else {
        // Session failed, stop polling and show error
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
      // Catch errors from initiating the action or awaiting the promise
      stopLogPolling(); // Stop polling on error
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
      // Only set isProcessing to false once the promise resolves/rejects
      setIsProcessing(false);
    }
  };

  // End session
  const endSession = async () => {
    try {
      setIsProcessing(true);
      addLog('info', 'Ending MCP playground session...');

      // Stop log polling
      stopLogPolling();

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
    if (!inputValue.trim() || !isSessionActive) {
      return;
    }

    try {
      setIsProcessing(true);
      setIsThinking(true);

      // Kullanıcı mesajını ekle
      const userMessage = {
        role: 'human',
        content: inputValue,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInputValue('');

      addLog('execution', `Executing query: "${userMessage.content}"`);

      // Log polling hızını artır
      stopLogPolling();
      startLogPolling();

      // Arayüzü güncelle ve düşünme durumunu göster
      setActiveTab('chat');

      // LLM'e sorguyu gönder
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

            // Tool mesajlarını ayrıca logla 
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
      setIsThinking(false);
      
      // Normal polling hızına dön
      stopLogPolling();
      startLogPolling();
    }
  };

  // Add effect to load settings only once
  useEffect(() => {
    const loadSettings = async () => {
      if (!profileUuid) {
        return;
      }

      try {
        const result = await getPlaygroundSettings(profileUuid);
        if (result.success && result.settings) {
          // Set both states simultaneously to avoid desync
          const newSettings = {
            provider: result.settings.provider,
            model: result.settings.model,
            temperature: result.settings.temperature,
            maxTokens: result.settings.maxTokens,
            logLevel: result.settings.logLevel,
          };
          
          setLlmConfig(newSettings);
          setLogLevel(result.settings.logLevel);
        }
      } catch (error) {
        console.error('Error loading settings:', error);
        addLog('error', `Failed to load settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    loadSettings();
  }, [profileUuid]);

  // Save settings with improved debounce
  const saveSettings = async () => {
    if (!profileUuid) {
      return;
    }

    try {
      addLog('info', 'Saving playground settings...');

      // Cancel any pending updates
      if (updateSettingsThrottledRef.current) {
        clearTimeout(updateSettingsThrottledRef.current);
      }
      
      // Set a longer debounce to ensure we don't trigger multiple saves
      updateSettingsThrottledRef.current = setTimeout(async () => {
        try {
          const result = await updatePlaygroundSettings(profileUuid, llmConfig);
          
          if (result.success) {
            addLog('info', 'Settings saved successfully');
          } else {
            addLog('error', `Failed to save settings: ${result.error || 'Unknown error'}`);
          }
          updateSettingsThrottledRef.current = null;
        } catch (error) {
          console.error('Failed to save settings:', error);
          addLog('error', `Exception saving settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
          updateSettingsThrottledRef.current = null;
        }
      }, 1500); // 1.5 second delay for debounce

    } catch (error) {
      console.error('Failed to save settings:', error);
      addLog('error', `Exception saving settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Cleanup effect for all timers
  useEffect(() => {
    return () => {
      // Clean up all timers when component unmounts
      if (logsPollingRef.current) {
        clearInterval(logsPollingRef.current);
      }
      if (updateSettingsThrottledRef.current) {
        clearTimeout(updateSettingsThrottledRef.current);
      }
    };
  }, []);

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

      <div className='grid grid-cols-12 gap-6'>
        {/* Config section wider: md:col-span-5, lg:col-span-4 */}
        <div className='col-span-12 md:col-span-5 lg:col-span-4'>
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

        {/* Chat section adjusted: md:col-span-7, lg:col-span-8 */}
        <div className='col-span-12 md:col-span-7 lg:col-span-8'>
          <PlaygroundChat
            messages={messages}
            inputValue={inputValue}
            setInputValue={setInputValue}
            isSessionActive={isSessionActive}
            isProcessing={isProcessing}
            isThinking={isThinking}
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
