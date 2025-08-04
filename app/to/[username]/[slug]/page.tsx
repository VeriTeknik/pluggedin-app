import { notFound } from 'next/navigation';
import { db } from '@/db';
import { embeddedChatsTable, projectsTable, users } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

interface PageProps {
  params: Promise<{ 
    username: string;
    slug: string;
  }>;
}

export default async function PublicChatPage({ params }: PageProps) {
  const { username, slug } = await params;

  // Get user by username
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!user) {
    notFound();
  }

  // Get the embedded chat by slug and user
  const [chatData] = await db
    .select({
      chat: embeddedChatsTable,
      project: projectsTable,
    })
    .from(embeddedChatsTable)
    .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
    .where(and(
      eq(projectsTable.user_id, user.id),
      eq(embeddedChatsTable.slug, slug),
      eq(embeddedChatsTable.is_public, true),
      eq(embeddedChatsTable.is_active, true)
    ))
    .limit(1);

  if (!chatData) {
    notFound();
  }

  const { chat, project } = chatData;

  // Redirect to the embed URL
  // We could also render the chat directly here, but redirecting keeps things simple
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold mb-2">{chat.name}</h1>
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
        </div>
      </div>
    </div>
  );
}