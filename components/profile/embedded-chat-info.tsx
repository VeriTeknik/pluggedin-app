'use client';

import { Bot, MessageSquare, Shield, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface EmbeddedChatInfoProps {
  chatData: {
    chatName: string;
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
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle>{chatData.chatName}</CardTitle>
              <CardDescription className="mt-1">
                AI Assistant by {chatData.user.name || chatData.user.username}
              </CardDescription>
            </div>
          </div>
          <Badge variant={chatData.requireApiKey ? 'secondary' : 'default'}>
            {chatData.requireApiKey ? 'Private' : 'Public'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {chatData.welcomeMessage && (
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm">{chatData.welcomeMessage}</p>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Interactive Chat</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">AI Powered</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Secure</span>
          </div>
        </div>

        {isOwner && (
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                This chat appears on your public profile
              </p>
              <Button variant="outline" size="sm" asChild>
                <a href="/embedded-chat/dashboard">Manage Chat</a>
              </Button>
            </div>
          </div>
        )}

        {!isOwner && (
          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              💬 Click the chat button in the bottom right corner to start a conversation with {chatData.user.name || chatData.user.username}'s AI assistant.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}