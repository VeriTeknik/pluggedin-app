'use client';

import { format } from 'date-fns';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getRecentConversations } from '@/app/actions/embedded-chat-analytics';
import { Button } from '@/components/ui/button';
import { useProjects } from '@/hooks/use-projects';

import { ConversationHistoryContent } from './components/conversation-history-content';

export default function ConversationHistoryPage() {
  const router = useRouter();
  const { currentProject, isLoading: projectsLoading } = useProjects();
  const [conversations, setConversations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!projectsLoading && currentProject) {
      // If no AI assistant, redirect to setup
      if (!currentProject.embedded_chat_uuid) {
        router.push('/embedded-chat');
        return;
      }

      // Load conversations
      loadConversations(currentProject.embedded_chat_uuid);
    }
  }, [currentProject, projectsLoading, router]);

  const loadConversations = async (chatUuid: string) => {
    try {
      setIsLoading(true);
      const conversationsResult = await getRecentConversations(chatUuid, 100);
      
      setConversations(conversationsResult.data?.map((conv: any) => ({
        ...conv,
        visitor_name: conv.visitor_name || undefined,
        visitor_email: conv.visitor_email || undefined,
        ended_at: conv.ended_at || undefined,
        page_url: conv.page_url || undefined,
        status: conv.status || 'ended',
      })) || []);
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (projectsLoading || isLoading || !currentProject) {
    return (
      <div className="container mx-auto py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Conversation History</h1>
          <p className="text-muted-foreground mt-2">
            Browse and manage all chat conversations
          </p>
        </div>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!currentProject.embedded_chat_uuid) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Conversation History</h1>
            <p className="text-muted-foreground mt-2">
              Browse and manage all chat conversations
            </p>
          </div>
          <Link href="/embedded-chat/dashboard">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>

      <ConversationHistoryContent
        chatUuid={currentProject.embedded_chat_uuid}
        initialConversations={conversations}
      />
    </div>
  );
}