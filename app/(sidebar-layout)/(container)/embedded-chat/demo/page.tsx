import { redirect } from 'next/navigation';

import { getAuthSession } from '@/lib/auth';
import { getCurrentProject } from '@/lib/projects';

import { DemoClient } from './demo-client';

export default async function EmbeddedChatDemo() {
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

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Enhanced Chat Demo</h1>
        <p className="text-muted-foreground mt-2">
          Experience the enhanced chat widget with all Phase 2 features
        </p>
      </div>

      <DemoClient 
        chatUuid={currentProject.embedded_chat_uuid}
        userId={session.user.id}
        userName={session.user.name || 'Demo User'}
        userAvatar={session.user.image}
      />
    </div>
  );
}