/**
 * React hook for secure WebSocket connection to chat monitoring
 * Handles authentication, reconnection, and GDPR consent
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useToast } from '@/hooks/use-toast';

export interface WebSocketMessage {
  type: string;
  payload?: any;
  error?: string;
  timestamp?: number;
}

export interface ChatWebSocketOptions {
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export interface ConsentState {
  hasConsent: boolean;
  purposes: string[];
  consentedAt?: Date;
}

const DEFAULT_OPTIONS: ChatWebSocketOptions = {
  autoConnect: true,
  reconnectAttempts: 5,
  reconnectDelay: 3000,
};

export function useChatWebSocket(options: ChatWebSocketOptions = {}) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [subscribedConversations, setSubscribedConversations] = useState<Set<string>>(new Set());
  const [consentState, setConsentState] = useState<ConsentState>({
    hasConsent: false,
    purposes: []
  });
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageQueueRef = useRef<WebSocketMessage[]>([]);
  const sessionIdRef = useRef<string>('');
  
  // Check for stored consent
  useEffect(() => {
    const storedConsent = localStorage.getItem('chat_monitoring_consent');
    if (storedConsent) {
      try {
        const consent = JSON.parse(storedConsent);
        setConsentState(consent);
      } catch (error) {
        console.error('Failed to parse stored consent:', error);
      }
    }
  }, []);
  
  const connect = useCallback(() => {
    if (!session?.user?.id) {
      console.log('No session available, skipping WebSocket connection');
      return;
    }
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }
    
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL || `${protocol}//${window.location.hostname}:8080`;
      
      console.log('Connecting to WebSocket:', wsUrl);
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = async () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        reconnectCountRef.current = 0;
        
        // Clear any pending reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        
        // Authenticate immediately
        if (session?.user?.id) {
          // Get JWT token from session or create one
          const token = await getAuthToken();
          if (token) {
            ws.send(JSON.stringify({
              type: 'auth',
              payload: { token }
            }));
          }
        }
        
        opts.onConnect?.();
      };
      
      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'connected':
              sessionIdRef.current = message.payload?.sessionId || '';
              break;
              
            case 'auth_success':
              setIsAuthenticated(true);
              setPermissions(message.payload?.permissions || []);
              
              // Send consent if available
              if (consentState.hasConsent) {
                ws.send(JSON.stringify({
                  type: 'consent',
                  payload: {
                    consent: true,
                    purposes: consentState.purposes
                  }
                }));
              }
              
              // Process queued messages
              while (messageQueueRef.current.length > 0) {
                const queuedMessage = messageQueueRef.current.shift();
                if (queuedMessage) {
                  ws.send(JSON.stringify(queuedMessage));
                }
              }
              
              toast({
                title: 'Connected',
                description: 'Chat monitoring connection established',
              });
              break;
              
            case 'error':
              console.error('WebSocket error:', message.error);
              toast({
                title: 'Connection Error',
                description: message.error || 'An error occurred',
                variant: 'destructive',
              });
              break;
              
            case 'consent_required':
              // Show consent dialog
              toast({
                title: 'Consent Required',
                description: 'Please provide consent to monitor chat conversations',
                variant: 'default',
              });
              break;
              
            case 'subscribed':
              setSubscribedConversations(prev => {
                const newSet = new Set(prev);
                newSet.add(message.payload?.conversationId);
                return newSet;
              });
              break;
              
            case 'unsubscribed':
              setSubscribedConversations(prev => {
                const newSet = new Set(prev);
                newSet.delete(message.payload?.conversationId);
                return newSet;
              });
              break;
              
            case 'idle_timeout':
              toast({
                title: 'Connection Timeout',
                description: 'Connection closed due to inactivity',
                variant: 'default',
              });
              break;
              
            case 'server_shutdown':
              toast({
                title: 'Server Maintenance',
                description: 'The monitoring server is restarting',
                variant: 'default',
              });
              break;
              
            default:
              // Pass message to handler
              opts.onMessage?.(message);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        opts.onError?.(new Error('WebSocket connection error'));
      };
      
      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        setIsAuthenticated(false);
        wsRef.current = null;
        
        opts.onDisconnect?.();
        
        // Attempt to reconnect if not a normal closure
        if (event.code !== 1000 && event.code !== 1001) {
          attemptReconnect();
        }
      };
      
      wsRef.current = ws;
      
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      opts.onError?.(error as Error);
      attemptReconnect();
    }
  }, [session, opts, toast, consentState]);
  
  const attemptReconnect = useCallback(() => {
    if (reconnectCountRef.current >= opts.reconnectAttempts!) {
      console.log('Max reconnection attempts reached');
      toast({
        title: 'Connection Failed',
        description: 'Unable to establish monitoring connection',
        variant: 'destructive',
      });
      return;
    }
    
    reconnectCountRef.current++;
    console.log(`Attempting reconnection ${reconnectCountRef.current}/${opts.reconnectAttempts}`);
    
    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, opts.reconnectDelay);
  }, [connect, opts, toast]);
  
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnect');
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setIsAuthenticated(false);
    setSubscribedConversations(new Set());
  }, []);
  
  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, queueing message');
      messageQueueRef.current.push(message);
      return false;
    }
    
    if (!isAuthenticated && message.type !== 'auth' && message.type !== 'consent') {
      console.warn('Not authenticated, queueing message');
      messageQueueRef.current.push(message);
      return false;
    }
    
    try {
      wsRef.current.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      return false;
    }
  }, [isAuthenticated]);
  
  const subscribeToConversation = useCallback((conversationId: string) => {
    return sendMessage({
      type: 'subscribe',
      payload: { conversationId }
    });
  }, [sendMessage]);
  
  const unsubscribeFromConversation = useCallback((conversationId: string) => {
    return sendMessage({
      type: 'unsubscribe',
      payload: { conversationId }
    });
  }, [sendMessage]);
  
  const sendInstruction = useCallback((conversationId: string, instruction: string) => {
    return sendMessage({
      type: 'instruction',
      payload: { conversationId, instruction }
    });
  }, [sendMessage]);
  
  const takeoverConversation = useCallback((conversationId: string) => {
    return sendMessage({
      type: 'takeover',
      payload: { conversationId }
    });
  }, [sendMessage]);
  
  const releaseConversation = useCallback((conversationId: string) => {
    return sendMessage({
      type: 'release',
      payload: { conversationId }
    });
  }, [sendMessage]);
  
  const provideConsent = useCallback((purposes: string[] = ['monitoring', 'support', 'quality']) => {
    const consent: ConsentState = {
      hasConsent: true,
      purposes,
      consentedAt: new Date()
    };
    
    // Store consent locally
    localStorage.setItem('chat_monitoring_consent', JSON.stringify(consent));
    setConsentState(consent);
    
    // Send to server if connected
    if (isConnected) {
      sendMessage({
        type: 'consent',
        payload: {
          consent: true,
          purposes
        }
      });
    }
    
    return true;
  }, [isConnected, sendMessage]);
  
  const revokeConsent = useCallback(() => {
    localStorage.removeItem('chat_monitoring_consent');
    setConsentState({
      hasConsent: false,
      purposes: []
    });
    
    // Disconnect if connected
    if (isConnected) {
      disconnect();
    }
  }, [isConnected, disconnect]);
  
  // Auto-connect when session is available
  useEffect(() => {
    if (opts.autoConnect && session?.user?.id) {
      connect();
    }
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [session, opts.autoConnect, connect]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);
  
  return {
    // Connection state
    isConnected,
    isAuthenticated,
    sessionId: sessionIdRef.current,
    permissions,
    subscribedConversations: Array.from(subscribedConversations),
    
    // Consent state
    consentState,
    provideConsent,
    revokeConsent,
    
    // Connection methods
    connect,
    disconnect,
    sendMessage,
    
    // Conversation methods
    subscribeToConversation,
    unsubscribeFromConversation,
    sendInstruction,
    takeoverConversation,
    releaseConversation,
  };
}

// Helper function to get auth token
async function getAuthToken(): Promise<string | null> {
  try {
    const response = await fetch('/api/auth/websocket-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.token;
    }
  } catch (error) {
    console.error('Failed to get auth token:', error);
  }
  
  return null;
}