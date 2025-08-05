'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Eye, 
  Download,
  Star,
  Clock,
  MessageSquare,
  Shield,
  User
} from 'lucide-react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { formatVisitorName, isAuthenticatedVisitor } from '@/lib/visitor-utils';

interface Conversation {
  uuid: string;
  visitor_id: string;
  visitor_name?: string;
  visitor_email?: string;
  started_at: Date;
  ended_at?: Date;
  status: 'active' | 'waiting' | 'human_controlled' | 'ended';
  message_count: number;
  rating?: number;
  page_url?: string;
  metadata?: any;
}

interface RecentConversationsTableProps {
  conversations: Conversation[];
  chatUuid: string;
  showAll?: boolean;
}

export function RecentConversationsTable({ 
  conversations, 
  chatUuid,
  showAll = false 
}: RecentConversationsTableProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-500">Active</Badge>;
      case 'waiting':
        return <Badge variant="secondary" className="bg-yellow-500">Waiting</Badge>;
      case 'human_controlled':
        return <Badge variant="default" className="bg-blue-500">Human</Badge>;
      case 'ended':
        return <Badge variant="outline">Ended</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getVisitorDisplay = (conv: Conversation) => {
    return formatVisitorName(conv.visitor_id, conv.visitor_name, conv.visitor_email);
  };

  const getDuration = (conv: Conversation) => {
    if (!conv.ended_at) return 'Ongoing';
    const start = new Date(conv.started_at);
    const end = new Date(conv.ended_at);
    const diff = end.getTime() - start.getTime();
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const getRatingStars = (rating?: number) => {
    if (!rating) return '-';
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-3 w-3 ${
              star <= rating
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-muted-foreground'
            }`}
          />
        ))}
      </div>
    );
  };

  if (conversations.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No conversations yet</p>
      </div>
    );
  }

  const displayConversations = showAll ? conversations : conversations.slice(0, 10);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Visitor</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Messages</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Rating</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayConversations.map((conv) => (
            <TableRow key={conv.uuid}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {isAuthenticatedVisitor(conv.visitor_id, conv.metadata) ? (
                    <Shield className="h-4 w-4 text-primary" />
                  ) : (
                    <User className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span>{getVisitorDisplay(conv)}</span>
                  {isAuthenticatedVisitor(conv.visitor_id, conv.metadata) && (
                    <Badge variant="outline" className="text-xs px-1 py-0 ml-1">
                      Auth
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1 text-sm">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(conv.started_at), { addSuffix: true })}
                </div>
              </TableCell>
              <TableCell>{getDuration(conv)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {conv.message_count}
                </div>
              </TableCell>
              <TableCell>{getStatusBadge(conv.status)}</TableCell>
              <TableCell>{getRatingStars(conv.rating)}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Link href={`/embedded-chat/conversations/${conv.uuid}`}>
                    <Button variant="ghost" size="sm" className="h-7 px-2">
                      <Eye className="h-3 w-3" />
                    </Button>
                  </Link>
                  <Button variant="ghost" size="sm" className="h-7 px-2">
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {!showAll && conversations.length > 10 && (
        <div className="text-center pt-4">
          <Link href="/embedded-chat/conversations">
            <Button variant="outline">
              View all {conversations.length} conversations
            </Button>
          </Link>
        </div>
      )}
    </>
  );
}