'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowLeft,
  Download,
  User,
  Bot,
  Globe,
  Clock,
  Mail,
  MapPin,
  Monitor,
  MessageSquare,
  AlertCircle,
  UserCircle
} from 'lucide-react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface Message {
  id: number;
  conversation_uuid: string;
  role: 'user' | 'assistant' | 'system' | 'human' | 'instruction';
  content: string;
  created_by?: 'ai' | 'human' | 'system';
  human_user_id?: string;
  is_internal?: boolean;
  tool_calls?: any;
  tool_results?: any;
  created_at: Date;
}

interface Conversation {
  uuid: string;
  visitor_id: string;
  visitor_name?: string;
  visitor_email?: string;
  visitor_ip?: string;
  visitor_user_agent?: string;
  referrer_url?: string;
  page_url?: string;
  started_at: Date;
  ended_at?: Date;
  status: 'active' | 'waiting' | 'human_controlled' | 'ended';
  assigned_user_id?: string;
  metadata?: any;
}

interface ConversationViewerProps {
  conversation: Conversation;
  messages: Message[];
  chatUuid: string;
}

export function ConversationViewer({ 
  conversation, 
  messages,
  chatUuid 
}: ConversationViewerProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-500">Active</Badge>;
      case 'waiting':
        return <Badge variant="secondary" className="bg-yellow-500">Waiting</Badge>;
      case 'human_controlled':
        return <Badge variant="default" className="bg-blue-500">Human Controlled</Badge>;
      default:
        return <Badge variant="outline">Ended</Badge>;
    }
  };

  const getDuration = () => {
    if (!conversation.ended_at) return 'Ongoing';
    const start = new Date(conversation.started_at);
    const end = new Date(conversation.ended_at);
    const diff = end.getTime() - start.getTime();
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const exportTranscript = () => {
    const transcript = messages.map(msg => 
      `[${format(new Date(msg.created_at), 'HH:mm:ss')}] ${msg.role.toUpperCase()}: ${msg.content}`
    ).join('\n\n');

    const metadata = `
Conversation Transcript
=======================
Visitor: ${conversation.visitor_name || conversation.visitor_id}
Email: ${conversation.visitor_email || 'N/A'}
Started: ${format(new Date(conversation.started_at), 'PPpp')}
Duration: ${getDuration()}
Status: ${conversation.status}
Messages: ${messages.length}
Page: ${conversation.page_url || 'N/A'}
=======================

${transcript}
    `.trim();

    const blob = new Blob([metadata], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-${conversation.uuid.slice(0, 8)}-${format(new Date(), 'yyyy-MM-dd')}.txt`;
    a.click();
  };

  const getMessageIcon = (role: string) => {
    switch (role) {
      case 'user':
        return <User className="h-4 w-4" />;
      case 'assistant':
        return <Bot className="h-4 w-4" />;
      case 'human':
        return <UserCircle className="h-4 w-4" />;
      case 'system':
      case 'instruction':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getMessageStyle = (msg: Message) => {
    if (msg.is_internal) return 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200';
    if (msg.role === 'system' || msg.role === 'instruction') return 'bg-blue-50 dark:bg-blue-950/20 border-blue-200';
    if (msg.role === 'human') return 'bg-purple-50 dark:bg-purple-950/20 border-purple-200';
    return '';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <Link href="/embedded-chat/conversations">
            <Button variant="ghost" size="sm" className="mb-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Conversations
            </Button>
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Conversation Details</h1>
          <p className="text-muted-foreground mt-2">
            {conversation.visitor_name || `Visitor ${conversation.visitor_id.slice(0, 8)}`}
          </p>
        </div>
        <div className="flex gap-2">
          {conversation.status === 'active' && (
            <Link href={`/embedded-chat/monitor?conversation=${conversation.uuid}`}>
              <Button variant="outline" size="sm">
                <Monitor className="h-4 w-4 mr-2" />
                Monitor Live
              </Button>
            </Link>
          )}
          <Button variant="outline" size="sm" onClick={exportTranscript}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Conversation Info */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Visitor Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{conversation.visitor_name || 'Anonymous'}</span>
              </div>
              {conversation.visitor_email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{conversation.visitor_email}</span>
                </div>
              )}
              {conversation.visitor_ip && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{conversation.visitor_ip}</span>
                </div>
              )}
              {conversation.page_url && (
                <div className="flex items-start gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span className="text-sm break-all">{conversation.page_url}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conversation Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                {getStatusBadge(conversation.status)}
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Started</span>
                <span className="text-sm">
                  {format(new Date(conversation.started_at), 'PPp')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Duration</span>
                <span className="text-sm">{getDuration()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Messages</span>
                <span className="text-sm">{messages.length}</span>
              </div>
              {conversation.assigned_user_id && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Assigned To</span>
                  <span className="text-sm">Agent {conversation.assigned_user_id.slice(0, 8)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Message Timeline */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Message Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={message.id}
                    className={cn(
                      'flex gap-3',
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    {message.role !== 'user' && (
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback>
                          {getMessageIcon(message.role)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={cn(
                        'max-w-[80%] rounded-lg p-3 space-y-1',
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted',
                        getMessageStyle(message)
                      )}
                    >
                      <div className="flex items-center gap-2 text-xs opacity-70">
                        <span className="capitalize">{message.role}</span>
                        {message.created_by && message.created_by !== 'ai' && (
                          <Badge variant="outline" className="text-xs">
                            {message.created_by}
                          </Badge>
                        )}
                        {message.is_internal && (
                          <Badge variant="outline" className="text-xs">
                            Internal
                          </Badge>
                        )}
                        <span>{format(new Date(message.created_at), 'HH:mm:ss')}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      
                      {/* Tool Calls */}
                      {message.tool_calls && (
                        <div className="mt-2 p-2 bg-background/50 rounded text-xs">
                          <span className="font-medium">Tools Used:</span>
                          <pre className="mt-1">{JSON.stringify(message.tool_calls, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                    {message.role === 'user' && (
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback>
                          <User className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}