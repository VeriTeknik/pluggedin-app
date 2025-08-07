import { and, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';

import { db } from '@/db';
import { embeddedChatsTable, projectsTable, users } from '@/db/schema';

interface PageProps {
  params: Promise<{
    username: string;
    uuid: string;
  }>;
}

export default async function ChatByUuidPage({ params }: PageProps) {
  const { username, uuid } = await params;

  // Find the user
  const user = await db.query.users.findFirst({
    where: eq(users.username, username),
  });

  if (!user) {
    notFound();
  }

  // Find the embedded chat by UUID
  const result = await db
    .select({
      chat: embeddedChatsTable,
      project: projectsTable,
    })
    .from(embeddedChatsTable)
    .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
    .where(and(
      eq(projectsTable.user_id, user.id),
      eq(embeddedChatsTable.uuid, uuid),
      eq(embeddedChatsTable.is_public, true),
      eq(embeddedChatsTable.is_active, true)
    ))
    .limit(1);

  if (result.length === 0) {
    notFound();
  }

  const { chat } = result[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold mb-2">{chat.name}</h1>
            {chat.description && (
              <p className="text-lg text-muted-foreground mb-2">{chat.description}</p>
            )}
            <p className="text-muted-foreground">
              Chat with {user.name || user.username}'s AI Assistant
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
            <iframe
              src={`/embed/chat/${chat.uuid}`}
              className="w-full h-[600px] border-0"
              title={chat.name}
              allow="clipboard-write"
            />
          </div>

          <div className="mt-8 text-center">
            <a
              href={`/to/${username}`}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              View {user.name || user.username}'s Profile →
            </a>
          </div>

          {!chat.slug && (
            <div className="mt-6 p-4 bg-blue-100 dark:bg-blue-900/20 rounded-lg text-center">
              <p className="text-sm">
                💡 Tip: Add a custom URL slug to this assistant in the settings for a cleaner URL like /to/{username}/assistant-name
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}