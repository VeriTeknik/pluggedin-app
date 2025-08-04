'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  MessageSquare, 
  User, 
  Globe, 
  Clock,
  Eye,
  UserPlus
} from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

interface Conversation {
  uuid: string;
  visitor_id: string;
  visitor_name?: string;
  visitor_email?: string;
  started_at: Date;
  status: 'active' | 'waiting' | 'human_controlled' | 'ended';
  message_count: number;
  last_message_at?: Date;
  page_url?: string;
}

interface ActiveConversationsListProps {
  conversations: Conversation[];
  chatUuid: string;
  showAll?: boolean;
}

export function ActiveConversationsList({ 
  conversations, 
  chatUuid,
  showAll = false 
}: ActiveConversationsListProps) {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-500">Active</Badge>;
      case 'waiting':
        return <Badge variant="secondary" className="bg-yellow-500">Waiting</Badge>;
      case 'human_controlled':
        return <Badge variant="default" className="bg-blue-500">Human</Badge>;
      default:
        return <Badge variant="outline">Ended</Badge>;
    }
  };

  const getVisitorDisplay = (conv: Conversation) => {
    if (conv.visitor_name) return conv.visitor_name;
    if (conv.visitor_email) return conv.visitor_email;
    return `Visitor ${conv.visitor_id.slice(0, 8)}`;
  };

  if (conversations.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No active conversations</p>
      </div>
    );
  }

  const displayConversations = showAll ? conversations : conversations.slice(0, 5);

  return (
    <div className="space-y-2">
      {displayConversations.map((conv) => (
        <div
          key={conv.uuid}
          className={`border rounded-lg p-3 hover:bg-muted/50 transition-colors cursor-pointer ${
            selectedConversation === conv.uuid ? 'bg-muted' : ''
          }`}
          onClick={() => setSelectedConversation(conv.uuid)}
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-sm">{getVisitorDisplay(conv)}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(conv.started_at), { addSuffix: true })}
                </div>
              </div>
            </div>
            {getStatusBadge(conv.status)}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {conv.message_count} messages
              </span>
              {conv.page_url && (
                <span className="flex items-center gap-1 truncate max-w-[200px]">
                  <Globe className="h-3 w-3" />
                  {new URL(conv.page_url).hostname}
                </span>
              )}
            </div>
            <div className="flex gap-1">
              <Link href={`/embedded-chat/conversations/${conv.uuid}`}>
                <Button variant="ghost" size="sm" className="h-7 px-2">
                  <Eye className="h-3 w-3" />
                </Button>
              </Link>
              {conv.status === 'active' && (
                <Link href={`/embedded-chat/monitor?conversation=${conv.uuid}`}>
                  <Button variant="ghost" size="sm" className="h-7 px-2">
                    <UserPlus className="h-3 w-3" />
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      ))}

      {!showAll && conversations.length > 5 && (
        <div className="text-center pt-2">
          <Link href="/embedded-chat/monitor">
            <Button variant="ghost" size="sm">
              View all {conversations.length} active conversations
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}