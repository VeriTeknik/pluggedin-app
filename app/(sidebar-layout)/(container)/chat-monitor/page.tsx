'use client';

import { format } from 'date-fns';
import { 
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  Eye, 
  Globe,
  MessageSquare,
  Send,
  Shield,
  UserCheck, 
  UserX} from 'lucide-react';
import { useSession } from 'next-auth/react';
import {useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription,CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useChatWebSocket } from '@/hooks/use-chat-websocket';
import { cn } from '@/lib/utils';

interface Conversation {
  uuid: string;
  embedded_chat_uuid: string;
  visitor_id: string;
  status: 'active' | 'waiting' | 'human_controlled' | 'ended';
  started_at: Date;
  assigned_user_id?: string;
  metadata?: any;
  last_heartbeat?: Date;
  message_count?: number;
  visitor_info?: {
    name?: string;
    email?: string;
    page_url?: string;
    ip?: string;
  };
}

interface Message {
  id: string;
  conversation_uuid: string;
  role: 'user' | 'assistant' | 'system' | 'instruction';
  content: string;
  created_at: Date;
  created_by?: string;
}

interface ConsentDialogProps {
  onAccept: () => void;
  onDecline: () => void;
}

function ConsentDialog({ onAccept, onDecline }: ConsentDialogProps) {
  const { t } = useTranslation();
  
  return (
    <Card className="max-w-2xl mx-auto mt-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          {t('chat_monitor.consent.title', 'Chat Monitoring Consent Required')}
        </CardTitle>
        <CardDescription>
          {t('chat_monitor.consent.description', 'GDPR Compliance Notice')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t('chat_monitor.consent.notice', 
              'By monitoring chat conversations, you will have access to personal data shared by visitors. This activity is logged for compliance purposes.'
            )}
          </AlertDescription>
        </Alert>
        
        <div className="space-y-3">
          <h4 className="font-medium text-sm">
            {t('chat_monitor.consent.purposes', 'Purposes of monitoring:')}
          </h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
              {t('chat_monitor.consent.purpose1', 'Provide customer support and assistance')}
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
              {t('chat_monitor.consent.purpose2', 'Monitor service quality and AI responses')}
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
              {t('chat_monitor.consent.purpose3', 'Ensure compliance with policies and regulations')}
            </li>
          </ul>
        </div>
        
        <div className="flex gap-3 pt-4">
          <Button onClick={onAccept} className="flex-1">
            {t('chat_monitor.consent.accept', 'I Understand and Accept')}
          </Button>
          <Button onClick={onDecline} variant="outline" className="flex-1">
            {t('chat_monitor.consent.decline', 'Decline')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ChatMonitorPage() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [instruction, setInstruction] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showConsent, setShowConsent] = useState(true);
  
  const {
    isConnected,
    isAuthenticated,
    permissions,
    subscribedConversations,
    consentState,
    provideConsent,
    revokeConsent,
    connect,
    disconnect,
    subscribeToConversation,
    unsubscribeFromConversation,
    sendInstruction,
    takeoverConversation,
    releaseConversation,
  } = useChatWebSocket({
    autoConnect: false,
    onMessage: handleWebSocketMessage,
    onConnect: () => console.log('WebSocket connected'),
    onDisconnect: () => console.log('WebSocket disconnected'),
  });
  
  // Handle consent
  useEffect(() => {
    if (!consentState.hasConsent) {
      setShowConsent(true);
    } else {
      setShowConsent(false);
      connect();
    }
  }, [consentState.hasConsent, connect]);
  
  // Load active conversations
  useEffect(() => {
    if (isAuthenticated) {
      loadConversations();
    }
  }, [isAuthenticated]);
  
  // Auto-refresh conversations
  useEffect(() => {
    if (!autoRefresh || !isAuthenticated) return;
    
    const interval = setInterval(() => {
      loadConversations();
    }, 10000); // Refresh every 10 seconds
    
    return () => clearInterval(interval);
  }, [autoRefresh, isAuthenticated]);
  
  async function loadConversations() {
    try {
      const response = await fetch('/api/chat-monitor/conversations');
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  }
  
  async function loadMessages(conversationId: string) {
    try {
      const response = await fetch(`/api/chat-monitor/conversations/${conversationId}/messages`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  }
  
  function handleWebSocketMessage(message: any) {
    console.log('WebSocket message:', message);
    
    switch (message.type) {
      case 'new_message':
        if (message.conversationId === selectedConversation) {
          setMessages(prev => [...prev, message.payload]);
        }
        break;
        
      case 'conversation_update':
        setConversations(prev => 
          prev.map(c => c.uuid === message.conversationId 
            ? { ...c, ...message.payload }
            : c
          )
        );
        break;
        
      case 'takeover':
      case 'released':
        // Refresh conversation status
        if (message.conversationId === selectedConversation) {
          loadMessages(message.conversationId);
        }
        loadConversations();
        break;
    }
  }
  
  const handleConsentAccept = () => {
    provideConsent(['monitoring', 'support', 'quality']);
    setShowConsent(false);
    connect();
  };
  
  const handleConsentDecline = () => {
    window.location.href = '/';
  };
  
  const handleSelectConversation = (conversationId: string) => {
    // Unsubscribe from previous conversation
    if (selectedConversation && subscribedConversations.includes(selectedConversation)) {
      unsubscribeFromConversation(selectedConversation);
    }
    
    // Subscribe to new conversation
    setSelectedConversation(conversationId);
    subscribeToConversation(conversationId);
    loadMessages(conversationId);
  };
  
  const handleSendInstruction = () => {
    if (!selectedConversation || !instruction.trim()) return;
    
    sendInstruction(selectedConversation, instruction);
    setInstruction('');
    
    // Add instruction to local messages
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      conversation_uuid: selectedConversation,
      role: 'instruction',
      content: instruction,
      created_at: new Date(),
      created_by: session?.user?.email || 'Admin',
    }]);
  };
  
  const handleTakeover = () => {
    if (!selectedConversation) return;
    takeoverConversation(selectedConversation);
  };
  
  const handleRelease = () => {
    if (!selectedConversation) return;
    releaseConversation(selectedConversation);
  };
  
  // Show consent dialog if needed
  if (showConsent) {
    return <ConsentDialog onAccept={handleConsentAccept} onDecline={handleConsentDecline} />;
  }
  
  // Get selected conversation details
  const currentConversation = conversations.find(c => c.uuid === selectedConversation);
  const isTakenOver = currentConversation?.status === 'human_controlled';
  const canTakeover = permissions.includes('takeover');
  const canSendInstruction = permissions.includes('send_instruction');
  
  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {t('chat_monitor.title', 'Chat Monitor Dashboard')}
          </h1>
          <p className="text-muted-foreground">
            {t('chat_monitor.description', 'Monitor and manage live chat conversations')}
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="auto-refresh">
              {t('chat_monitor.auto_refresh', 'Auto-refresh')}
            </Label>
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
          </div>
          
          <Badge variant={isConnected ? 'default' : 'destructive'}>
            <Activity className="h-3 w-3 mr-1" />
            {isConnected ? t('common.connected', 'Connected') : t('common.disconnected', 'Disconnected')}
          </Badge>
        </div>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('chat_monitor.active_chats', 'Active Chats')}
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {conversations.filter(c => c.status === 'active').length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('chat_monitor.waiting_assistance', 'Waiting for Assistance')}
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {conversations.filter(c => c.status === 'waiting').length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('chat_monitor.human_controlled', 'Human Controlled')}
            </CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {conversations.filter(c => c.status === 'human_controlled').length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('chat_monitor.monitored', 'Monitored')}
            </CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {subscribedConversations.length}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversations List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">
              {t('chat_monitor.conversations', 'Conversations')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[600px]">
              {conversations.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  {t('chat_monitor.no_conversations', 'No active conversations')}
                </div>
              ) : (
                <div className="divide-y">
                  {conversations.map((conv) => (
                    <button
                      key={conv.uuid}
                      onClick={() => handleSelectConversation(conv.uuid)}
                      className={cn(
                        "w-full p-4 text-left hover:bg-accent transition-colors",
                        selectedConversation === conv.uuid && "bg-accent"
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>
                                {conv.visitor_info?.name?.[0] || 'V'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm">
                                {conv.visitor_info?.name || `Visitor ${conv.visitor_id.slice(0, 8)}`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {conv.visitor_info?.email || 'No email'}
                              </p>
                            </div>
                          </div>
                          
                          {conv.visitor_info?.page_url && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Globe className="h-3 w-3" />
                              {new URL(conv.visitor_info.page_url).pathname}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex flex-col items-end gap-1">
                          <Badge
                            variant={
                              conv.status === 'active' ? 'default' :
                              conv.status === 'waiting' ? 'secondary' :
                              conv.status === 'human_controlled' ? 'outline' :
                              'destructive'
                            }
                            className="text-xs"
                          >
                            {conv.status}
                          </Badge>
                          
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(conv.started_at), 'HH:mm')}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
        
        {/* Chat View */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {currentConversation ? (
                  <span className="flex items-center gap-2">
                    {currentConversation.visitor_info?.name || `Visitor ${currentConversation.visitor_id.slice(0, 8)}`}
                    {subscribedConversations.includes(currentConversation.uuid) && (
                      <Badge variant="outline" className="text-xs">
                        <Eye className="h-3 w-3 mr-1" />
                        Monitoring
                      </Badge>
                    )}
                  </span>
                ) : (
                  t('chat_monitor.select_conversation', 'Select a conversation')
                )}
              </CardTitle>
              
              {currentConversation && (
                <div className="flex items-center gap-2">
                  {isTakenOver ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRelease}
                      disabled={!canTakeover}
                    >
                      <UserX className="h-4 w-4 mr-1" />
                      {t('chat_monitor.release', 'Release')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={handleTakeover}
                      disabled={!canTakeover}
                    >
                      <UserCheck className="h-4 w-4 mr-1" />
                      {t('chat_monitor.takeover', 'Take Over')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          
          <CardContent className="p-0">
            {selectedConversation ? (
              <div className="flex flex-col h-[550px]">
                {/* Messages */}
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "flex gap-3",
                          message.role === 'user' ? 'justify-end' : 'justify-start'
                        )}
                      >
                        {message.role !== 'user' && (
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              {message.role === 'assistant' ? 'AI' : 
                               message.role === 'instruction' ? 'ADM' : 'SYS'}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        
                        <div className={cn(
                          "max-w-[70%] rounded-lg px-4 py-2",
                          message.role === 'user' ? 'bg-primary text-primary-foreground' :
                          message.role === 'instruction' ? 'bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800' :
                          'bg-muted'
                        )}>
                          {message.role === 'instruction' && (
                            <p className="text-xs font-medium mb-1 text-yellow-800 dark:text-yellow-200">
                              Instruction from {message.created_by}
                            </p>
                          )}
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          <p className="text-xs opacity-70 mt-1">
                            {format(new Date(message.created_at), 'HH:mm:ss')}
                          </p>
                        </div>
                        
                        {message.role === 'user' && (
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              {currentConversation?.visitor_info?.name?.[0] || 'V'}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                
                {/* Instruction Input */}
                {canSendInstruction && !isTakenOver && (
                  <div className="border-t p-4">
                    <div className="flex gap-2">
                      <Textarea
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        placeholder={t('chat_monitor.instruction_placeholder', 
                          'Send instruction to AI (e.g., "Be more helpful", "Ask for contact info")'
                        )}
                        className="flex-1 min-h-[60px] max-h-[120px]"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendInstruction();
                          }
                        }}
                      />
                      <Button
                        onClick={handleSendInstruction}
                        disabled={!instruction.trim()}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-[550px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t('chat_monitor.no_selection', 'Select a conversation to monitor')}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}