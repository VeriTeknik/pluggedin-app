import { notFound } from 'next/navigation';
import { db } from '@/db';
import { embeddedChatsTable, projectsTable } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { EmbeddedChatWidget } from './components/embedded-chat-widget';

interface PageProps {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{ key?: string }>;
}

export default async function EmbeddedChatPage({ params, searchParams }: PageProps) {
  const { uuid: chatUuid } = await params;
  const { key } = await searchParams;
  const apiKey = key || '';

  // Fetch embedded chat configuration with project info
  const [chatConfig] = await db
    .select({
      chat: embeddedChatsTable,
      project: projectsTable,
    })
    .from(embeddedChatsTable)
    .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
    .where(and(
      eq(embeddedChatsTable.uuid, chatUuid),
      eq(embeddedChatsTable.is_active, true)
    ))
    .limit(1);

  if (!chatConfig) {
    notFound();
  }

  const { chat, project } = chatConfig;

  // Validate API key if required
  if (chat.require_api_key) {
    if (!apiKey || chat.api_key !== apiKey) {
      return (
        <div className="flex h-screen items-center justify-center p-4">
          <div className="text-center">
            <h2 className="text-lg font-semibold mb-2">Authentication Required</h2>
            <p className="text-muted-foreground">
              {!apiKey ? 'API key is required to access this chat.' : 'Invalid API key provided.'}
            </p>
          </div>
        </div>
      );
    }
  }

  // Check domain whitelist if configured
  // This would be checked on the client side as well for security

  return <EmbeddedChatWidget chat={chat} project={project} />;
}