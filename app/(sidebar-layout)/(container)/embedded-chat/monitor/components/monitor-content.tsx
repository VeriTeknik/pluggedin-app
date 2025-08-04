'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  MessageSquare, 
  User, 
  Clock, 
  Globe, 
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface MonitorContentProps {
  chatUuid: string;
}

interface ActiveConversation {
  uuid: string;
  visitor_id: string;
  visitor_name?: string;
  visitor_email?: string;
  started_at: Date;
  status: 'active' | 'waiting' | 'human_controlled' | 'ended';
  message_count: number;
  last_message_at?: Date;
  page_url?: string;
  last_message?: string;
  agent_typing?: boolean;
}

export function MonitorContent({ chatUuid }: MonitorContentProps) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ActiveConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Load conversations
  useEffect(() => {
    loadConversations();
  }, [chatUuid]);

  // Auto-refresh every 5 seconds when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      loadConversations();
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefresh, chatUuid]);

  const loadConversations = async () => {
    try {
      // In a real implementation, this would call an API endpoint
      // For now, we'll simulate with sample data
      setConversations([
        {
          uuid: 'conv-1',
          visitor_id: 'visitor-1',
          visitor_name: 'John Doe',
          started_at: new Date(),
          status: 'active',
          message_count: 5,
          last_message_at: new Date(),
          page_url: 'https://example.com/products',
          last_message: 'Can you help me with pricing?',
          agent_typing: false
        },
        {
          uuid: 'conv-2',
          visitor_id: 'visitor-2',
          visitor_email: 'jane@example.com',
          started_at: new Date(Date.now() - 10 * 60 * 1000),
          status: 'waiting',
          message_count: 3,
          last_message_at: new Date(Date.now() - 2 * 60 * 1000),
          page_url: 'https://example.com/support',
          last_message: 'I need technical support',
          agent_typing: true
        }
      ]);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to load conversations:', error);
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500';
      case 'waiting':
        return 'bg-yellow-500';
      case 'human_controlled':
        return 'bg-blue-500';
      case 'ended':
        return 'bg-gray-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4" />;
      case 'waiting':
        return <AlertCircle className="h-4 w-4" />;
      case 'human_controlled':
        return <User className="h-4 w-4" />;
      case 'ended':
        return <XCircle className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getTimeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <div className={`h-2 w-2 rounded-full ${autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {conversations.length} active conversation{conversations.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? 'Pause' : 'Resume'} Auto-refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={loadConversations}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Now
          </Button>
          <Link href="/embedded-chat/dashboard">
            <Button variant="outline" size="sm">
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>

      {/* Conversations Grid */}
      {conversations.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No active conversations</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {conversations.map((conv) => (
            <Card 
              key={conv.uuid}
              className={`cursor-pointer transition-all hover:shadow-lg ${
                selectedConversation === conv.uuid ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() => setSelectedConversation(conv.uuid)}
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {conv.visitor_name || conv.visitor_email || `Visitor ${conv.visitor_id.slice(0, 8)}`}
                    </CardTitle>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Started {getTimeAgo(conv.started_at)}
                    </div>
                  </div>
                  <Badge className={`${getStatusColor(conv.status)} text-white`}>
                    <span className="flex items-center gap-1">
                      {getStatusIcon(conv.status)}
                      {conv.status.replace('_', ' ')}
                    </span>
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {conv.page_url && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Globe className="h-3 w-3" />
                    <span className="truncate">{new URL(conv.page_url).pathname}</span>
                  </div>
                )}
                
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Messages</span>
                    <span className="font-medium">{conv.message_count}</span>
                  </div>
                  
                  {conv.last_message && (
                    <div className="p-2 bg-muted rounded-md">
                      <p className="text-sm truncate">{conv.last_message}</p>
                      {conv.last_message_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatTime(conv.last_message_at)}
                        </p>
                      )}
                    </div>
                  )}
                  
                  {conv.agent_typing && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" />
                        <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                      <span>AI is typing...</span>
                    </div>
                  )}
                </div>

                <div className="pt-2 flex gap-2">
                  <Link href={`/embedded-chat/conversations/${conv.uuid}`} className="flex-1">
                    <Button size="sm" variant="outline" className="w-full">
                      View Details
                    </Button>
                  </Link>
                  {conv.status === 'waiting' && (
                    <Button size="sm" variant="default" className="flex-1">
                      Take Over
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}