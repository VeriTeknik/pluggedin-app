import { and,eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { db } from '@/db';
import { embeddedChatsTable, projectsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';
import { EmbeddedChat } from '@/types/embedded-chat';

import { ConfigurationClient } from './configuration-client';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{
    uuid: string;
  }>;
}

export default async function EmbeddedChatConfigPage({ params }: PageProps) {
  const session = await getAuthSession();
  
  if (!session?.user) {
    redirect('/login');
  }

  // Await params as required in Next.js 15
  const { uuid } = await params;

  // Get the embedded chat WITH ownership verification
  const [chatWithProject] = await db
    .select({
      chat: embeddedChatsTable,
      project: projectsTable,
    })
    .from(embeddedChatsTable)
    .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
    .where(and(
      eq(embeddedChatsTable.uuid, uuid),
      eq(projectsTable.user_id, session.user.id) // CRITICAL: Verify ownership
    ))
    .limit(1);

  if (!chatWithProject) {
    // User doesn't own this chat - redirect to their own embedded chat
    redirect('/embedded-chat');
  }

  const { chat: dbChat } = chatWithProject;
  
  // Transform database chat to match EmbeddedChat type
  const chat: EmbeddedChat = {
    uuid: dbChat.uuid,
    project_uuid: dbChat.project_uuid,
    name: dbChat.name,
    slug: dbChat.slug,
    description: dbChat.description,
    enabled_mcp_server_uuids: dbChat.enabled_mcp_server_uuids || [],
    enable_rag: dbChat.enable_rag ?? false,
    allowed_domains: dbChat.allowed_domains || [],
    contact_routing: dbChat.contact_routing || {},
    custom_instructions: dbChat.custom_instructions,
    welcome_message: dbChat.welcome_message,
    suggested_questions: dbChat.suggested_questions || [],
    theme_config: dbChat.theme_config || {},
    theme_color: undefined,
    placeholder_text: undefined,
    position: (dbChat.position as EmbeddedChat['position']) || 'bottom-right',
    install_count: dbChat.install_count || 0,
    message_count: undefined,
    last_active_at: dbChat.last_active_at,
    model_config: dbChat.model_config as EmbeddedChat['model_config'],
    human_oversight: dbChat.human_oversight as EmbeddedChat['human_oversight'],
    context_window_size: dbChat.context_window_size || 4096,
    max_conversation_length: dbChat.max_conversation_length || 100,
    offline_config: dbChat.offline_config as EmbeddedChat['offline_config'],
    is_public: dbChat.is_public ?? false,
    is_active: dbChat.is_active ?? true,
    api_key: dbChat.api_key,
    api_key_created_at: dbChat.api_key_created_at,
    require_api_key: dbChat.require_api_key ?? false,
    api_key_last_used_at: dbChat.api_key_last_used_at,
    bot_avatar_url: dbChat.bot_avatar_url,
    expose_capabilities: dbChat.expose_capabilities ?? false,
    // Discovery fields
    location: dbChat.location,
    profession: dbChat.profession,
    expertise: dbChat.expertise || [],
    category: dbChat.category,
    subcategory: dbChat.subcategory,
    language: dbChat.language || 'en',
    timezone: dbChat.timezone,
    industry: dbChat.industry,
    keywords: dbChat.keywords || [],
    company_name: dbChat.company_name,
    company_size: dbChat.company_size,
    target_audience: dbChat.target_audience || [],
    service_hours: dbChat.service_hours || {},
    response_time: dbChat.response_time,
    pricing_model: dbChat.pricing_model,
    semantic_tags: dbChat.semantic_tags || [],
    use_cases: dbChat.use_cases || [],
    capabilities_summary: dbChat.capabilities_summary,
    personality_traits: dbChat.personality_traits || [],
    interaction_style: dbChat.interaction_style,
    created_at: dbChat.created_at,
    updated_at: dbChat.updated_at,
  };
  
  // Use client component to handle Hub validation
  return (
    <ConfigurationClient
      chat={chat}
      chatUuid={uuid}
      projectName={chatWithProject.project.name}
      projectUuid={chatWithProject.project.uuid}
    />
  );
}