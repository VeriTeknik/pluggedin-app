'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useProjects } from '@/hooks/use-projects';
import { EmbeddedChat } from '@/types/embedded-chat';

import { ChatConfigurationTabs } from './components/chat-configuration-tabs';

interface ConfigurationClientProps {
  chat: EmbeddedChat;
  chatUuid: string;
  projectName: string;
  projectUuid: string;
}

export function ConfigurationClient({ 
  chat, 
  chatUuid, 
  projectName,
  projectUuid 
}: ConfigurationClientProps) {
  const router = useRouter();
  const { currentProject, isLoading, error } = useProjects();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    // Once we have the current project, check if this chat belongs to it
    if (!isLoading && !error && currentProject) {
      if (currentProject.uuid !== projectUuid) {
        // This chat belongs to a different Hub, redirect to embedded chat home
        setIsRedirecting(true);
        router.push('/embedded-chat');
      }
    }
  }, [currentProject, isLoading, error, projectUuid, router]);

  // Show error if projects failed to load
  if (error) {
    return (
      <div className="container mx-auto py-10">
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <CardTitle>Error Loading Configuration</CardTitle>
              </div>
              <CardDescription>
                We couldn't load your project information.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Please try refreshing the page or contact support if the problem persists.
              </p>
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button onClick={() => window.location.reload()} variant="outline">
                Refresh Page
              </Button>
              <Button asChild>
                <Link href="/embedded-chat">
                  Go to Dashboard
                </Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  // Show loading while checking Hub context
  if (isLoading || !currentProject || isRedirecting) {
    return (
      <div className="container mx-auto py-10">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">
              {isRedirecting ? 'Redirecting...' : 'Loading configuration...'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // If we're here and the Hub matches, show the configuration
  if (currentProject.uuid !== projectUuid) {
    // This will redirect in useEffect, show loading meanwhile
    return (
      <div className="container mx-auto py-10">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Redirecting...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <span>Hub:</span>
          <span className="font-medium">{projectName}</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{chat.name}</h1>
        <p className="text-muted-foreground mt-2">
          Configure your embedded AI assistant
        </p>
      </div>

      <ChatConfigurationTabs 
        chat={chat}
        chatUuid={chatUuid}
      />
    </div>
  );
}