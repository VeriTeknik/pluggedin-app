'use client';

import { Bot, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface EmbeddedChatInfoProps {
  chatData: {
    chatName: string;
    description?: string | null;
    welcomeMessage?: string | null;
    requireApiKey: boolean;
    user: {
      name?: string | null;
      username: string;
    };
  };
  isOwner?: boolean;
}

export function EmbeddedChatInfo({ chatData, isOwner }: EmbeddedChatInfoProps) {
  if (!isOwner) {
    // Don't show info card for visitors - they get the embedded chat directly
    return null;
  }

  return (
    <Card className="overflow-hidden border-2 border-purple-100 dark:border-purple-900/30">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-blue-500/5" />
      <CardHeader className="relative">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="p-3 bg-gradient-to-br from-purple-500/10 to-blue-500/10 rounded-xl">
                <Bot className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <Sparkles className="h-3 w-3 text-yellow-500 absolute -top-1 -right-1" />
            </div>
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                {chatData.chatName}
                <span className="text-sm">✨</span>
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Your AI assistant lives here!
              </p>
            </div>
          </div>
          <Badge 
            variant={chatData.requireApiKey ? 'secondary' : 'default'}
            className="rounded-full px-3"
          >
            {chatData.requireApiKey ? '🔒 Private' : '🌍 Public'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="relative space-y-4">
        {chatData.description && (
          <p className="text-muted-foreground">
            {chatData.description}
          </p>
        )}
        
        {chatData.welcomeMessage && (
          <div className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 rounded-xl">
            <p className="text-sm italic">
              "{chatData.welcomeMessage}"
            </p>
          </div>
        )}
        
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-full">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <span>Always online</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 rounded-full">
            <span>🎯</span>
            <span>Smart & helpful</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-full">
            <span>💬</span>
            <span>Chat ready</span>
          </div>
        </div>

        <div className="pt-4 border-t border-purple-100 dark:border-purple-900/30">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Visitors can chat with your assistant below 👇
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              asChild
              className="rounded-full hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-300 dark:hover:border-purple-700"
            >
              <a href="/embedded-chat/dashboard">
                <Sparkles className="h-3 w-3 mr-1.5" />
                Customize
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}