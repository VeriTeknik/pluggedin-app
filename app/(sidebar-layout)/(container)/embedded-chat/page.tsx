import { redirect } from 'next/navigation';

import { getAuthSession } from '@/lib/auth';
import { getUserProjects } from '@/lib/projects';

import { EmbeddedChatClient } from './embedded-chat-client';

export default async function EmbeddedChatPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect('/login');
  }

  // Check if user has any projects
  const userProjects = await getUserProjects(session.user.id);
  const hasProjects = userProjects.length > 0;

  // Use client component to handle project selection
  return <EmbeddedChatClient userHasProjects={hasProjects} />;
}