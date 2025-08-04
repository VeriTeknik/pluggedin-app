import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/auth';
import { getCurrentProject } from '@/lib/projects';
import { DashboardContent } from './components/dashboard-content';
import { getDashboardMetrics, getRecentConversations, getActiveConversations } from '@/app/actions/embedded-chat-analytics';

export default async function EmbeddedChatDashboard() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const currentProject = await getCurrentProject(session.user.id);
  if (!currentProject) {
    redirect('/');
  }

  // If embedded chat is not set up, redirect to setup
  if (!currentProject.embedded_chat_uuid || !currentProject.embedded_chat_enabled) {
    redirect('/embedded-chat');
  }

  // Fetch dashboard data
  const [metricsResult, recentResult, activeResult] = await Promise.all([
    getDashboardMetrics(currentProject.embedded_chat_uuid),
    getRecentConversations(currentProject.embedded_chat_uuid),
    getActiveConversations(currentProject.embedded_chat_uuid),
  ]);

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Embedded Chat Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Monitor and manage your AI chat assistant
        </p>
      </div>

      <DashboardContent
        chatUuid={currentProject.embedded_chat_uuid}
        metrics={metricsResult.data || {
          activeConversations: 0,
          todayConversations: 0,
          todayMessages: 0,
          avgResponseTime: 0,
          humanInterventions: 0,
          satisfactionScore: 0,
        }}
        recentConversations={recentResult.data?.map((conv: any) => ({
          ...conv,
          visitor_name: conv.visitor_name || undefined,
          visitor_email: conv.visitor_email || undefined,
          ended_at: conv.ended_at || undefined,
          page_url: conv.page_url || undefined,
          status: conv.status || 'ended',
        })) || []}
        activeConversations={activeResult.data?.map((conv: any) => ({
          ...conv,
          visitor_name: conv.visitor_name || undefined,
          visitor_email: conv.visitor_email || undefined,
          ended_at: conv.ended_at || undefined,
          page_url: conv.page_url || undefined,
          status: conv.status || 'active',
        })) || []}
      />
    </div>
  );
}