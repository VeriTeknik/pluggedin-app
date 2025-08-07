'use client';

import { Bot, Globe,Lock, MessageSquare, Sparkles } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface AssistantCardProps {
  assistant: {
    uuid: string;
    name: string;
    slug?: string | null;
    description?: string | null;
    welcomeMessage?: string | null;
    requireApiKey: boolean;
    lastActiveAt?: Date | null;
    stats?: {
      totalMessages: number;
      totalConversations: number;
      activeConversations: number;
    };
    user: {
      username: string;
      name?: string | null;
    };
  };
  isOwner?: boolean;
  username: string;
}

export function AssistantCard({ assistant, isOwner, username }: AssistantCardProps) {
  const chatUrl = assistant.slug 
    ? `/to/${username}/${assistant.slug}`
    : `/to/${username}/chat/${assistant.uuid}`;

  return (
    <Card className="hover:shadow-lg transition-shadow duration-300 border-purple-100 dark:border-purple-900/30">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="p-3 bg-gradient-to-br from-purple-500/10 to-blue-500/10 rounded-xl">
                <Bot className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <Sparkles className="h-3 w-3 text-yellow-500 absolute -top-1 -right-1" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                {assistant.name}
              </h3>
              {assistant.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {assistant.description}
                </p>
              )}
            </div>
          </div>
          <Badge 
            variant={assistant.requireApiKey ? 'secondary' : 'default'}
            className="rounded-full px-3 flex items-center gap-1"
          >
            {assistant.requireApiKey ? (
              <>
                <Lock className="h-3 w-3" />
                <span>Private</span>
              </>
            ) : (
              <>
                <Globe className="h-3 w-3" />
                <span>Public</span>
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {assistant.welcomeMessage && (
          <div className="p-3 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 rounded-lg">
            <p className="text-sm italic line-clamp-2">
              "{assistant.welcomeMessage}"
            </p>
          </div>
        )}
        
        {/* Show statistics if available */}
        {assistant.stats && (assistant.stats.totalMessages > 0 || assistant.stats.totalConversations > 0) && (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {assistant.stats.totalConversations > 0 && (
              <div className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                <span>{assistant.stats.totalConversations} conversations</span>
              </div>
            )}
            {assistant.stats.totalMessages > 0 && (
              <div className="flex items-center gap-1">
                <span>•</span>
                <span>{assistant.stats.totalMessages} messages</span>
              </div>
            )}
            {assistant.stats.activeConversations > 0 && (
              <div className="flex items-center gap-1">
                <span>•</span>
                <span className="text-green-600 dark:text-green-400">
                  {assistant.stats.activeConversations} active
                </span>
              </div>
            )}
          </div>
        )}
        
        <div className="flex items-center justify-between pt-2">
          <div className="flex flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-full">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span>Online</span>
            </div>
            {assistant.lastActiveAt && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-900/20 text-gray-700 dark:text-gray-400 rounded-full">
                <span>Last active: {new Date(assistant.lastActiveAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>
          
          {isOwner ? (
            <Button 
              variant="outline" 
              size="sm" 
              asChild
              className="rounded-full hover:bg-purple-50 dark:hover:bg-purple-900/20"
            >
              <Link href={`/embedded-chat/${assistant.uuid}`}>
                <Sparkles className="h-3 w-3 mr-1.5" />
                Configure
              </Link>
            </Button>
          ) : (
            <Button 
              variant="default" 
              size="sm" 
              asChild
              className="rounded-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              <Link href={chatUrl}>
                <MessageSquare className="h-3 w-3 mr-1.5" />
                Chat Now
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}