import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/auth';
import { getCurrentProject } from '@/lib/projects';
import { EmbeddedChatSetup } from './components/embedded-chat-setup';
import { RedirectHandler } from './redirect-handler';

export default async function EmbeddedChatPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const currentProject = await getCurrentProject(session.user.id);
  
  // If no project or database error, show setup page with a message
  if (!currentProject) {
    return (
      <div className="container mx-auto py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Embedded Chat</h1>
          <p className="text-muted-foreground mt-2">
            Set up your AI chat assistant
          </p>
        </div>
        <div className="bg-muted/50 border rounded-lg p-6 text-center">
          <p className="text-muted-foreground mb-4">
            Unable to load project information. Please ensure you have a project set up first.
          </p>
        </div>
      </div>
    );
  }

  // If embedded chat is already set up, show redirect component
  if (currentProject.embedded_chat_uuid) {
    if (currentProject.embedded_chat_enabled) {
      // Chat is enabled, go to dashboard
      return <RedirectHandler 
        redirectTo="/embedded-chat/dashboard" 
        message="Redirecting to dashboard..."
      />;
    } else {
      // Chat exists but not enabled, go to configuration
      return <RedirectHandler 
        redirectTo={`/embedded-chat/${currentProject.embedded_chat_uuid}`}
        message="Redirecting to configuration..."
      />;
    }
  }

  // No chat exists, show setup page
  return <EmbeddedChatSetup project={{
    uuid: currentProject.uuid,
    name: currentProject.name,
    embedded_chat_enabled: currentProject.embedded_chat_enabled ?? false,
    embedded_chat_uuid: currentProject.embedded_chat_uuid,
  }} />;
}