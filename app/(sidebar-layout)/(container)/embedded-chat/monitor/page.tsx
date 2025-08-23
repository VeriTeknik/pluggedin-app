import { redirect } from 'next/navigation';

import { getAuthSession } from '@/lib/auth';
import { getCurrentProject } from '@/lib/projects';

import { MonitorContent } from './components/monitor-content';

export default async function EmbeddedChatMonitorPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const currentProject = await getCurrentProject(session.user.id);
  if (!currentProject) {
    redirect('/');
  }

  // Only check if embedded_chat_uuid exists, not if it's enabled
  // The monitor can still be accessed even if chat is not yet enabled
  if (!currentProject.embedded_chat_uuid) {
    redirect('/embedded-chat');
  }

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Live Chat Monitor</h1>
        <p className="text-muted-foreground mt-2">
          Monitor active conversations in real-time
        </p>
      </div>

      <MonitorContent chatUuid={currentProject.embedded_chat_uuid} />
    </div>
  );
}