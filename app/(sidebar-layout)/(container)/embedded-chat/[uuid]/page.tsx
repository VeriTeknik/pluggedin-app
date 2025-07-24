import { eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';

import { db } from '@/db';
import { embeddedChatsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

import { ChatConfigurationTabs } from './components/chat-configuration-tabs';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: {
    uuid: string;
  };
}

export default async function EmbeddedChatConfigPage({ params }: PageProps) {
  const session = await getAuthSession();
  
  if (!session?.user) {
    redirect('/login');
  }

  // Get the embedded chat
  const [chat] = await db
    .select()
    .from(embeddedChatsTable)
    .where(eq(embeddedChatsTable.uuid, params.uuid))
    .limit(1);

  if (!chat) {
    notFound();
  }

  // Verify user has access (through project ownership)
  // This is handled by validateEmbeddedChatAccess in server actions
  
  return (
    <div className="container mx-auto py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{chat.name}</h1>
        <p className="text-muted-foreground mt-2">
          Configure your embedded AI assistant
        </p>
      </div>

      <ChatConfigurationTabs 
        chat={chat}
        chatUuid={params.uuid}
      />
    </div>
  );
}