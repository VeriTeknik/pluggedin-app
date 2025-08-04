import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/auth';
import { getCurrentProject } from '@/lib/projects';
import { getRecentConversations } from '@/app/actions/embedded-chat-analytics';
import { ConversationHistoryContent } from './components/conversation-history-content';

export default async function ConversationHistoryPage() {
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

  // Fetch all conversations
  const conversationsResult = await getRecentConversations(currentProject.embedded_chat_uuid, 100);

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Conversation History</h1>
        <p className="text-muted-foreground mt-2">
          Browse and manage all chat conversations
        </p>
      </div>

      <ConversationHistoryContent
        chatUuid={currentProject.embedded_chat_uuid}
        initialConversations={conversationsResult.data?.map((conv: any) => ({
          ...conv,
          visitor_name: conv.visitor_name || undefined,
          visitor_email: conv.visitor_email || undefined,
          ended_at: conv.ended_at || undefined,
          page_url: conv.page_url || undefined,
          status: conv.status || 'ended',
        })) || []}
      />
    </div>
  );
}