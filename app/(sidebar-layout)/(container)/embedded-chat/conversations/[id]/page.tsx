'use client';

import { Loader2 } from 'lucide-react';
import { notFound, useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getConversationById } from '@/app/actions/embedded-chat-analytics';
import { useProjects } from '@/hooks/use-projects';

import { ConversationViewer } from './components/conversation-viewer';

export default function ConversationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = params.id as string;
  
  const { currentProject, isLoading: projectsLoading } = useProjects();
  const [conversationData, setConversationData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFoundError, setNotFoundError] = useState(false);

  useEffect(() => {
    if (!projectsLoading && currentProject) {
      // If no AI assistant, redirect to setup
      if (!currentProject.embedded_chat_uuid) {
        router.push('/embedded-chat');
        return;
      }

      // Load conversation
      loadConversation();
    }
  }, [currentProject, projectsLoading, router, conversationId]);

  const loadConversation = async () => {
    try {
      setIsLoading(true);
      const conversationResult = await getConversationById(conversationId);
      
      if (!conversationResult.success || !conversationResult.data) {
        setNotFoundError(true);
        return;
      }

      const { conversation: dbConversation, messages: dbMessages } = conversationResult.data;
      
      // Transform conversation to match the expected type
      const conversation = {
        ...dbConversation,
        visitor_name: dbConversation.visitor_name || undefined,
        visitor_email: dbConversation.visitor_email || undefined,
        visitor_ip: dbConversation.visitor_ip || undefined,
        visitor_user_agent: dbConversation.visitor_user_agent || undefined,
        referrer_url: dbConversation.referrer_url || undefined,
        page_url: dbConversation.page_url || undefined,
        ended_at: dbConversation.ended_at || undefined,
        assigned_user_id: dbConversation.assigned_user_id || undefined,
        metadata: dbConversation.metadata || undefined,
        status: dbConversation.status || 'ended',
      };
      
      // Transform messages to match the expected type
      const messages = dbMessages.map((msg: any) => ({
        ...msg,
        created_by: msg.created_by || undefined,
        human_user_id: msg.human_user_id || undefined,
        is_internal: msg.is_internal ?? undefined,
        tool_calls: msg.tool_calls || undefined,
        tool_results: msg.tool_results || undefined,
      }));

      setConversationData({ conversation, messages });
    } catch (error) {
      console.error('Error loading conversation:', error);
      setNotFoundError(true);
    } finally {
      setIsLoading(false);
    }
  };

  if (notFoundError) {
    notFound();
  }

  if (projectsLoading || isLoading || !currentProject) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!currentProject.embedded_chat_uuid || !conversationData) {
    return null; // Will redirect or show not found
  }

  return (
    <div className="container mx-auto py-6">
      <ConversationViewer
        conversation={conversationData.conversation}
        messages={conversationData.messages}
        chatUuid={currentProject.embedded_chat_uuid}
      />
    </div>
  );
}