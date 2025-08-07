import { notFound,redirect } from 'next/navigation';

import { getConversationById } from '@/app/actions/embedded-chat-analytics';
import { getAuthSession } from '@/lib/auth';
import { getCurrentProject } from '@/lib/projects';

import { ConversationViewer } from './components/conversation-viewer';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ConversationDetailPage({ params }: PageProps) {
  const { id: conversationId } = await params;
  
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const currentProject = await getCurrentProject(session.user.id);
  if (!currentProject) {
    redirect('/');
  }

  if (!currentProject.embedded_chat_uuid || !currentProject.embedded_chat_enabled) {
    redirect('/embedded-chat');
  }

  // Fetch conversation details
  const conversationResult = await getConversationById(conversationId);
  
  if (!conversationResult.success || !conversationResult.data) {
    notFound();
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

  return (
    <div className="container mx-auto py-6">
      <ConversationViewer
        conversation={conversation}
        messages={messages}
        chatUuid={currentProject.embedded_chat_uuid}
      />
    </div>
  );
}