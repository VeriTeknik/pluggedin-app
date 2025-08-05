export interface EmbeddedChat {
  uuid: string;
  project_uuid: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  enabled_mcp_server_uuids: string[];
  enable_rag: boolean;
  allowed_domains: string[];
  contact_routing: Record<string, any>;
  custom_instructions: string | null;
  welcome_message: string | null;
  suggested_questions: string[];
  theme_config: Record<string, any>;
  theme_color?: string;
  placeholder_text?: string;
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  install_count: number;
  message_count?: number;
  last_active_at: Date | null;
  model_config: {
    provider: 'openai' | 'anthropic' | 'google' | 'xai';
    model: string;
    temperature: number;
    max_tokens: number;
    top_p: number;
    frequency_penalty: number;
    presence_penalty: number;
  };
  human_oversight: {
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
  };
  context_window_size: number;
  max_conversation_length: number;
  offline_config: {
    enabled: boolean;
    message: string;
    email_notification: boolean;
    capture_contact: boolean;
  };
  is_public: boolean;
  is_active: boolean;
  api_key: string | null;
  api_key_created_at: Date | null;
  require_api_key: boolean;
  api_key_last_used_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // Statistics
  stats?: {
    totalMessages: number;
    totalConversations: number;
    activeConversations: number;
  };
}

export interface Project {
  uuid: string;
  user_id: string;
  name: string;
  avatar_url?: string | null;
  description?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ChatPersona {
  id: number;
  embedded_chat_uuid: string;
  name: string;
  role: string | null;
  instructions: string;
  avatar_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_calendar_link: string | null;
  is_active: boolean;
  is_default: boolean;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface ChatConversation {
  uuid: string;
  embedded_chat_uuid: string;
  visitor_id: string;
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_ip: string | null;
  visitor_user_agent: string | null;
  referrer_url: string | null;
  page_url: string | null;
  started_at: Date;
  ended_at: Date | null;
  metadata: Record<string, any>;
  status: 'active' | 'waiting' | 'human_controlled' | 'ended';
  assigned_user_id: string | null;
  assigned_at: Date | null;
  takeover_at: Date | null;
  recovery_token: string;
  last_heartbeat: Date;
  created_at: Date;
  updated_at: Date;
}

export interface ChatMessage {
  id: number;
  conversation_uuid: string;
  role: 'user' | 'assistant' | 'system' | 'human' | 'instruction';
  content: string;
  persona_id: number | null;
  tool_calls: any | null;
  tool_results: any | null;
  metadata: Record<string, any>;
  created_by: 'ai' | 'human' | 'system';
  human_user_id: string | null;
  is_internal: boolean;
  model_provider: string | null;
  model_name: string | null;
  model_config: any | null;
  tokens_used: number | null;
  created_at: Date;
}