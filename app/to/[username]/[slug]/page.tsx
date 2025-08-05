import { notFound } from 'next/navigation';
import { db } from '@/db';
import { embeddedChatsTable, projectsTable, users } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { NativeEmbeddedChat } from '@/components/embedded-chat/native-embedded-chat';

interface PageProps {
  params: Promise<{
    username: string;
    slug: string;
  }>;
}

export default async function ChatPage({ params }: PageProps) {
  const { username, slug } = await params;

  console.log('Chat page - username:', username, 'slug:', slug);

  // Find the user
  const user = await db.query.users.findFirst({
    where: eq(users.username, username),
  });

  if (!user) {
    console.log('User not found:', username);
    notFound();
  }

  console.log('User found:', user.id);

  // Find the embedded chat by slug
  const result = await db
    .select({
      chat: embeddedChatsTable,
      project: projectsTable,
    })
    .from(embeddedChatsTable)
    .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
    .where(and(
      eq(projectsTable.user_id, user.id),
      eq(projectsTable.embedded_chat_enabled, true),
      eq(embeddedChatsTable.slug, slug),
      eq(embeddedChatsTable.is_public, true),
      eq(embeddedChatsTable.is_active, true)
    ))
    .limit(1);

  console.log('Query result:', result.length, 'chats found');

  if (result.length === 0) {
    // Let's also check if the chat exists but with different conditions
    const debugResult = await db
      .select({
        chat: embeddedChatsTable,
        project: projectsTable,
      })
      .from(embeddedChatsTable)
      .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .where(and(
        eq(projectsTable.user_id, user.id),
        eq(embeddedChatsTable.slug, slug)
      ))
      .limit(1);
    
    if (debugResult.length > 0) {
      console.log('Chat found but not public/active:', debugResult[0].chat);
    } else {
      console.log('No chat found with this slug at all');
    }
    
    notFound();
  }

  const { chat } = result[0];

  // Log chat configuration for debugging
  console.log('Chat config:', {
    uuid: chat.uuid,
    require_api_key: chat.require_api_key,
    is_public: chat.is_public,
    is_active: chat.is_active,
  });

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

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden h-[600px]">
            <NativeEmbeddedChat
              chatUuid={chat.uuid}
              position="relative"
              className="h-full"
              welcomeMessage={chat.welcome_message || `Hi! Welcome to ${user.name || user.username}'s chat assistant. How can I help you today?`}
              placeholder="Type your message..."
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