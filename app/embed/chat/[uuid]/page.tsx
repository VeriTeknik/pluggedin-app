import { and,eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';

import { db } from '@/db';
import { embeddedChatsTable, projectsTable } from '@/db/schema';
import { EmbeddedChat, Project } from '@/types/embedded-chat';

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

  // Transform chat to match EmbeddedChat type with proper defaults
  const embeddedChat: EmbeddedChat = {
    uuid: chat.uuid,
    project_uuid: chat.project_uuid,
    name: chat.name,
    enabled_mcp_server_uuids: chat.enabled_mcp_server_uuids || [],
    enable_rag: chat.enable_rag ?? false,
    allowed_domains: chat.allowed_domains || [],
    contact_routing: chat.contact_routing || {},
    custom_instructions: chat.custom_instructions,
    welcome_message: chat.welcome_message,
    suggested_questions: chat.suggested_questions || [],
    theme_config: chat.theme_config || {},
    theme_color: undefined, // Not in database schema
    placeholder_text: undefined, // Not in database schema
    position: (chat.position as 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left') || 'bottom-right',
    install_count: chat.install_count || 0,
    message_count: undefined, // Not in database schema
    last_active_at: chat.last_active_at,
    model_config: (chat.model_config && typeof chat.model_config === 'object' && 'provider' in chat.model_config)
      ? chat.model_config as {
          provider: 'openai' | 'anthropic' | 'google' | 'xai';
          model: string;
          temperature: number;
          max_tokens: number;
          top_p: number;
          frequency_penalty: number;
          presence_penalty: number;
        }
      : {
          provider: 'openai' as const,
          model: 'gpt-4',
          temperature: 0.7,
          max_tokens: 1000,
          top_p: 1.0,
          frequency_penalty: 0.0,
          presence_penalty: 0.0,
        },
    human_oversight: (chat.human_oversight && typeof chat.human_oversight === 'object' && 'enabled' in chat.human_oversight)
      ? chat.human_oversight as {
          enabled: boolean;
          mode: 'monitor' | 'assist' | 'takeover';
          notification_channels: string[];
          auto_assign: boolean;
          business_hours: {
            timezone: string;
            days: number[];
            start_time: string;
            end_time: string;
          } | null;
        }
      : {
          enabled: false,
          mode: 'monitor' as const,
          notification_channels: ['app'],
          auto_assign: false,
          business_hours: null,
        },
    context_window_size: chat.context_window_size || 10,
    max_conversation_length: chat.max_conversation_length || 100,
    offline_config: (chat.offline_config && typeof chat.offline_config === 'object' && 'enabled' in chat.offline_config)
      ? chat.offline_config as {
          enabled: boolean;
          message: string;
          email_notification: boolean;
          capture_contact: boolean;
        }
      : {
          enabled: true,
          message: "We'll get back to you soon!",
          email_notification: true,
          capture_contact: true,
        },
    is_public: chat.is_public ?? false,
    is_active: chat.is_active ?? true,
    api_key: chat.api_key,
    api_key_created_at: chat.api_key_created_at,
    require_api_key: chat.require_api_key ?? false,
    api_key_last_used_at: chat.api_key_last_used_at,
    created_at: chat.created_at,
    updated_at: chat.updated_at,
    bot_avatar_url: chat.bot_avatar_url,
    expose_capabilities: chat.expose_capabilities ?? false,
    debug_mode: chat.debug_mode ?? false,
  };

  // Transform project to match Project interface
  const projectData: Project = {
    uuid: project.uuid,
    user_id: project.user_id,
    name: project.name,
    avatar_url: null,
    description: null,
    created_at: project.created_at,
    updated_at: project.created_at, // Use created_at as fallback since updated_at doesn't exist
  };

  return <EmbeddedChatWidget chat={embeddedChat} project={projectData} />;
}