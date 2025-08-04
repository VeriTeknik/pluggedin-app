import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/auth';
import { getCurrentProject } from '@/lib/projects';

export default async function EmbeddedChatAnalyticsPage() {
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

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Chat Analytics</h1>
        <p className="text-muted-foreground mt-2">
          Detailed insights and performance metrics for your embedded chat
        </p>
      </div>

      <div className="text-center py-12">
        <p className="text-muted-foreground">Analytics dashboard coming soon...</p>
      </div>
    </div>
  );
}