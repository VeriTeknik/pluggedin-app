'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProjects } from '@/hooks/use-projects';
import { EmbeddedChatSetup } from './components/embedded-chat-setup';
import { Loader2 } from 'lucide-react';

interface EmbeddedChatClientProps {
  userHasProjects: boolean;
}

export function EmbeddedChatClient({ userHasProjects }: EmbeddedChatClientProps) {
  const router = useRouter();
  // Always call hooks before any conditional returns
  const { currentProject, isLoading } = useProjects();

  useEffect(() => {
    // Only run redirect logic if user has projects
    if (userHasProjects && !isLoading && currentProject) {
      // If embedded chat is already set up, redirect based on status
      if (currentProject.embedded_chat_uuid) {
        if (currentProject.embedded_chat_enabled) {
          router.push('/embedded-chat/dashboard');
        } else {
          router.push(`/embedded-chat/${currentProject.embedded_chat_uuid}`);
        }
      }
    }
  }, [currentProject, isLoading, router, userHasProjects]);

  if (!userHasProjects) {
    return (
      <div className="container mx-auto py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Embedded Chat</h1>
          <p className="text-muted-foreground mt-2">
            Set up your AI chat assistant
          </p>
        </div>
        <div className="bg-muted/50 border rounded-lg p-6 text-center">
          <p className="text-muted-foreground mb-4">
            Please create a Hub first before setting up embedded chat.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading || !currentProject) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // If no embedded chat exists, show setup
  if (!currentProject.embedded_chat_uuid) {
    return <EmbeddedChatSetup project={{
      uuid: currentProject.uuid,
      name: currentProject.name,
      embedded_chat_enabled: currentProject.embedded_chat_enabled ?? false,
      embedded_chat_uuid: currentProject.embedded_chat_uuid ?? null,
    }} />;
  }

  // Loading state while redirecting
  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Redirecting...</span>
      </div>
    </div>
  );
}