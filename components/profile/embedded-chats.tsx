import { ExternalLink,MessageSquare } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { EmbeddedChat } from '@/types/social';

interface EmbeddedChatsProps {
  chats: EmbeddedChat[];
  isLoading?: boolean;
}

export function EmbeddedChats({ chats, isLoading = false }: EmbeddedChatsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-6 bg-muted rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-muted rounded w-1/2"></div>
            </CardHeader>
            <CardContent>
              <div className="h-4 bg-muted rounded w-full mb-2"></div>
              <div className="h-4 bg-muted rounded w-4/5"></div>
            </CardContent>
            <CardFooter>
              <div className="h-10 bg-muted rounded w-28"></div>
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground text-lg">No embedded chats found</p>
        <p className="text-muted-foreground text-sm mt-2">
          Embedded chats allow you to share interactive AI assistants on your profile
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {chats.map((chat) => (
        <Card key={chat.uuid} className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <MessageSquare className="h-4 w-4 mr-2 text-primary" />
              {chat.title}
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                {chat.is_active ? 'Active' : 'Inactive'}
              </Badge>
              <span>{new Date(chat.created_at).toLocaleDateString()}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-grow">
            <p className="text-sm text-muted-foreground line-clamp-3">
              {chat.description || 'No description provided'}
            </p>
            <div className="mt-2">
              {chat.settings && typeof chat.settings === 'object' && (
                <div className="rounded-md bg-muted p-2 mt-2">
                  <p className="text-xs text-muted-foreground">
                    {Object.keys(chat.settings).includes('model') 
                      ? `Model: ${chat.settings.model}` 
                      : 'Custom settings configured'}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/chats/${chat.uuid}`}>
                <ExternalLink className="h-4 w-4 mr-2" />
                View Chat
              </Link>
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
} 