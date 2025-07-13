'use client';

import { AlertCircle, CheckCircle, Terminal, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

interface StreamMessage {
  type: 'log' | 'progress' | 'error' | 'complete';
  message: string;
  timestamp: number;
  data?: any;
}

interface StreamingCliToastProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  serverUuid: string;
  profileUuid: string;
  className?: string;
  onComplete?: (success: boolean, data?: any) => void;
}

export function StreamingCliToast({
  isOpen,
  onClose,
  title = 'MCP Discovery',
  serverUuid,
  profileUuid,
  className,
  onComplete,
}: StreamingCliToastProps) {
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionStartedRef = useRef<string | null>(null);
  const isCompleteRef = useRef<boolean>(false);

  // Component state and refs

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [messages]);

  // Connect to streaming endpoint using fetch (supports authentication)
  useEffect(() => {
    if (!isOpen) {
      // Cleanup when closed, but don't reset messages immediately - let them persist for viewing
      sessionStartedRef.current = null; // Clear session tracking
      isCompleteRef.current = false; // Reset completion ref
      setIsConnected(false);
      setIsComplete(false);
      setHasError(false);
      return;
    }

    // Create a unique session key with timestamp to handle rapid re-discovery
    const sessionKey = `${serverUuid}-${profileUuid}-${Date.now()}`;
    sessionStartedRef.current = sessionKey;

    // Only reset messages when starting a new discovery session
    const resetState = () => {
      setMessages([]);
      setIsConnected(false);
      setIsComplete(false);
      setHasError(false);
      isCompleteRef.current = false; // Reset completion ref
    };
    resetState();

    // Use AbortController for cleanup
    const abortController = new AbortController();

    // Connect to streaming endpoint using fetch (supports credentials)
    const connectToStream = async () => {
      try {
        const url = `/api/discover/stream/${serverUuid}?profileUuid=${profileUuid}`;
        
        // Use the main abort controller instead of a timeout-based one
        let response: Response;
        try {
          response = await fetch(url, {
            method: 'GET',
            headers: {
              Accept: 'text/event-stream',
              'Cache-Control': 'no-cache',
            },
            credentials: 'same-origin', // Include cookies for authentication
            signal: abortController.signal,
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
          }
        } catch (fetchError) {
          throw fetchError;
        }

        if (!response.body) {
          throw new Error('No response body available');
        }

        setIsConnected(true);
        setMessages((prev) => [
          ...prev,
          {
            type: 'log',
            message: 'Connected to discovery stream...',
            timestamp: Date.now(),
          },
        ]);

        // Ensure we scroll to bottom when first connected
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }, 100);

        // Create a reader for the stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let lastDataTime = Date.now();
        const dataTimeoutMs = 60000; // 60 seconds timeout for no data

        // Set up a keep-alive check
        const keepAliveInterval = setInterval(() => {
          if (Date.now() - lastDataTime > dataTimeoutMs) {
            console.error('Discovery stream timeout - no data received for 60 seconds');
            reader.cancel();
            clearInterval(keepAliveInterval);
          }
        }, 5000); // Check every 5 seconds

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            // Update last data time
            lastDataTime = Date.now();

            // Decode the chunk and add to buffer
            buffer += decoder.decode(value, { stream: true });

          // Process complete lines in the buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep the incomplete line in buffer

          for (const line of lines) {
            const trimmedLine = line.trim();

            // Skip empty lines and comments
            if (!trimmedLine || trimmedLine.startsWith(':')) {
              continue;
            }

            // Parse SSE data lines
            if (trimmedLine.startsWith('data: ')) {
              const jsonData = trimmedLine.slice(6); // Remove 'data: ' prefix

              try {
                const message: StreamMessage = JSON.parse(jsonData);
                setMessages((prev) => [...prev, message]);

                if (message.type === 'error') {
                  setHasError(true);
                }

                if (message.type === 'complete') {
                  setIsComplete(true);
                  isCompleteRef.current = true; // Track completion status in ref
                  onComplete?.(true, message.data);
                  // Auto-close after showing completion for a longer time
                  setTimeout(() => {
                    onClose();
                  }, 8000); // 8 seconds instead of 2
                  return; // Exit the reading loop
                }
              } catch (error) {
                console.error('Failed to parse SSE message:', error);
              }
            }
          }
        }
        } finally {
          // Clean up the keep-alive interval
          clearInterval(keepAliveInterval);
        }
      } catch (error) {
        // Don't show error if discovery already completed successfully or if aborted
        if (isCompleteRef.current || abortController.signal.aborted) {
          return;
        }

        console.error('Fetch streaming error during discovery:', error);
        setHasError(true);
        setMessages((prev) => [
          ...prev,
          {
            type: 'error',
            message: `Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: Date.now(),
          },
        ]);

        setIsConnected(false);
        onComplete?.(false);
      }
    };

    // Start the connection
    connectToStream();

    // Cleanup on unmount or when dependencies change
    return () => {
      abortController.abort();
    };
  }, [isOpen, serverUuid, profileUuid]); // Removed onComplete and onClose from dependencies to prevent recreation

  if (!isOpen) return null;

  const getStatusIcon = () => {
    if (hasError) return <AlertCircle className='w-4 h-4 text-red-500' />;
    if (isComplete) return <CheckCircle className='w-4 h-4 text-green-500' />;
    return <Terminal className='w-4 h-4 text-blue-500' />;
  };

  const getStatusText = () => {
    if (hasError) return 'Error';
    if (isComplete) return 'Complete';
    if (isConnected) return 'Discovering...';
    return 'Connecting...';
  };

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 w-[700px] bg-black/95 backdrop-blur-sm rounded-lg border border-gray-800 shadow-2xl transition-all duration-300',
        isOpen ? 'h-[500px]' : 'h-0',
        className
      )}>
      {/* Header */}
      <div className='flex items-center justify-between px-4 py-2 border-b border-gray-800'>
        <div className='flex items-center gap-2'>
          {getStatusIcon()}
          <span className='text-sm font-mono text-gray-300'>{title}</span>
          <span className='text-xs text-gray-500'>({getStatusText()})</span>
        </div>
        <button
          type='button'
          onClick={onClose}
          className='p-1 hover:bg-gray-800 rounded transition-colors'
          aria-label='Close discovery output'>
          <X className='w-4 h-4 text-gray-400' />
        </button>
      </div>

      {/* Stream Content */}
      <div
        ref={scrollRef}
        className='overflow-y-auto h-[calc(100%-40px)] p-4 font-mono text-xs custom-scrollbar scroll-smooth'
        style={{ scrollBehavior: 'smooth' }}>
        {messages.map((message, index) => (
          <StreamLine key={index} message={message} />
        ))}

        {/* Connection status indicator */}
        {!isConnected && !hasError && (
          <div className='flex items-center gap-2 mt-2'>
            <div className='inline-block w-2 h-4 bg-blue-500 animate-pulse' />
            <span className='text-gray-500 text-xs'>
              Connecting to discovery stream...
            </span>
          </div>
        )}

        {isConnected && !isComplete && !hasError && (
          <div className='flex items-center gap-2 mt-2'>
            <div className='inline-block w-2 h-4 bg-green-500 animate-pulse' />
            <span className='text-gray-500 text-xs'>
              Live discovery in progress...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

interface StreamLineProps {
  message: StreamMessage;
}

function StreamLine({ message }: StreamLineProps) {
  // Color coding based on message type and content
  const getLineStyle = () => {
    if (message.type === 'error') return 'text-red-400';
    if (message.type === 'complete') return 'text-green-400';
    if (message.type === 'progress') return 'text-yellow-400';

    // Content-based styling for log messages
    if (message.message.includes('ERROR') || message.message.includes('error'))
      return 'text-red-400';
    if (
      message.message.includes('Successfully') ||
      message.message.includes('SUCCESS') ||
      message.message.includes('completed')
    )
      return 'text-green-400';
    if (
      message.message.includes('Discovering') ||
      message.message.includes('Fetching')
    )
      return 'text-yellow-300';
    if (
      message.message.includes('Deleting') ||
      message.message.includes('Inserting')
    )
      return 'text-blue-300';
    if (
      message.message.includes('Connected') ||
      message.message.includes('Found')
    )
      return 'text-cyan-400';

    return 'text-gray-300';
  };

  // Format timestamp
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Add type prefix for non-log messages
  const getPrefix = () => {
    if (message.type === 'progress') return '[PROGRESS] ';
    if (message.type === 'error') return '[ERROR] ';
    if (message.type === 'complete') return '[COMPLETE] ';
    return '';
  };

  return (
    <div className={cn('whitespace-pre-wrap flex gap-2', getLineStyle())}>
      <span className='text-gray-500 text-xs shrink-0'>
        {formatTime(message.timestamp)}
      </span>
      <span>
        {getPrefix()}
        {message.message}
      </span>
    </div>
  );
}
