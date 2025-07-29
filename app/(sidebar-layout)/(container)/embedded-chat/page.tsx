import { redirect } from 'next/navigation';

import { getAuthSession } from '@/lib/auth';
import { getCurrentProject } from '@/lib/projects';

import { EmbeddedChatSetup } from './components/embedded-chat-setup';

export default async function EmbeddedChatPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const currentProject = await getCurrentProject(session.user.id);
  if (!currentProject) {
    redirect('/');
  }

  // If embedded chat is already set up, redirect to the configuration page
  if (currentProject.embedded_chat_uuid && currentProject.embedded_chat_enabled) {
    redirect(`/embedded-chat/${currentProject.embedded_chat_uuid}`);
  }

  return <EmbeddedChatSetup project={currentProject} />;
}