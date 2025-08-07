import { and, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';

import { NativeEmbeddedChat } from '@/components/embedded-chat/native-embedded-chat';
import { db } from '@/db';
import { chatPersonasTable, embeddedChatsTable, projectsTable, users } from '@/db/schema';
import { DEFAULT_CAPABILITIES } from '@/lib/integrations/types';

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

  // Get active personas and their capabilities
  const personas = await db.query.chatPersonasTable.findMany({
    where: and(
      eq(chatPersonasTable.embedded_chat_uuid, chat.uuid),
      eq(chatPersonasTable.is_active, true)
    ),
  });

  // Collect all enabled capabilities from all active personas
  const enabledCapabilities = new Set<string>();
  const capabilityDetails: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
  }> = [];

  personas.forEach(persona => {
    const capabilities = persona.capabilities as any[] || [];
    capabilities.forEach(cap => {
      if (cap.enabled) {
        enabledCapabilities.add(cap.id);
      }
    });
  });

  // Get details for enabled capabilities
  DEFAULT_CAPABILITIES.forEach(cap => {
    if (enabledCapabilities.has(cap.id)) {
      capabilityDetails.push({
        id: cap.id,
        name: cap.name,
        description: cap.description,
        category: cap.category,
      });
    }
  });

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-6 text-center">
            <h1 className="text-3xl font-bold text-white mb-2">{chat.name}</h1>
            {chat.description && (
              <p className="text-lg text-gray-400 mb-2">{chat.description}</p>
            )}
            <p className="text-gray-500">
              Chat with {user.name || user.username}'s AI Assistant
            </p>
          </div>

          {/* Chat Interface - Full Width */}
          <div className="bg-gray-800 rounded-2xl shadow-xl overflow-hidden" style={{ height: 'calc(100vh - 280px)' }}>
            <NativeEmbeddedChat
              chatUuid={chat.uuid}
              position="relative"
              className="h-full"
              welcomeMessage={chat.welcome_message || `Hi! Welcome to ${user.name || user.username}'s chat assistant. How can I help you today?`}
              placeholder="Type your message..."
              capabilities={capabilityDetails}
            />
          </div>
          
          {/* Profile Link */}
          <div className="mt-4 text-center">
            <a
              href={`/to/${username}`}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              View {user.name || user.username}'s Profile →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}