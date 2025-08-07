'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

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
  const { currentProject, isLoading } = useProjects();

  useEffect(() => {
    // Once we have the current project, check if this chat belongs to it
    if (!isLoading && currentProject) {
      if (currentProject.uuid !== projectUuid) {
        // This chat belongs to a different Hub, redirect to embedded chat home
        router.push('/embedded-chat');
      }
    }
  }, [currentProject, isLoading, projectUuid, router]);

  // Show loading while checking Hub context
  if (isLoading || !currentProject) {
    return (
      <div className="container mx-auto py-10">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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