CREATE TABLE IF NOT EXISTS "chat_analytics" (
	"id" serial PRIMARY KEY NOT NULL,
	"embedded_chat_uuid" uuid NOT NULL,
	"date" timestamp NOT NULL,
	"conversations_started" integer DEFAULT 0,
	"messages_sent" integer DEFAULT 0,
	"messages_received" integer DEFAULT 0,
	"contacts_captured" integer DEFAULT 0,
	"avg_conversation_duration" integer,
	"unique_visitors" integer DEFAULT 0,
	"domains" jsonb DEFAULT '{}'::jsonb,
	"tool_usage" jsonb DEFAULT '{}'::jsonb,
	"rag_queries" integer DEFAULT 0,
	"rag_hit_rate" integer,
	"persona_usage" jsonb DEFAULT '{}'::jsonb,
	"human_interventions" integer DEFAULT 0,
	"human_takeovers" integer DEFAULT 0,
	"avg_response_time" integer,
	"conversation_completion_rate" integer,
	"drop_off_points" jsonb DEFAULT '[]'::jsonb,
	"tokens_used" jsonb DEFAULT '{}'::jsonb,
	"estimated_cost" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_analytics_chat_date" UNIQUE("embedded_chat_uuid","date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_billing" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"plan_type" varchar(20),
	"billing_period_start" timestamp NOT NULL,
	"billing_period_end" timestamp NOT NULL,
	"conversations_limit" integer,
	"conversations_used" integer DEFAULT 0,
	"messages_limit" integer,
	"messages_used" integer DEFAULT 0,
	"overage_charges" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_uuid" uuid,
	"embedded_chat_uuid" uuid NOT NULL,
	"persona_id" integer,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"company" text,
	"message" text NOT NULL,
	"inquiry_type" varchar(50),
	"status" varchar(20) DEFAULT 'new',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_conversations" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"embedded_chat_uuid" uuid NOT NULL,
	"visitor_id" text NOT NULL,
	"visitor_name" text,
	"visitor_email" text,
	"visitor_ip" text,
	"visitor_user_agent" text,
	"referrer_url" text,
	"page_url" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"status" varchar(20) DEFAULT 'active',
	"assigned_user_id" text,
	"assigned_at" timestamp with time zone,
	"takeover_at" timestamp with time zone,
	"recovery_token" varchar(64) DEFAULT md5(random()::text || clock_timestamp()::text),
	"last_heartbeat" timestamp with time zone DEFAULT now(),
	"gdpr_consent" boolean DEFAULT false,
	"gdpr_consent_timestamp" timestamp with time zone,
	"deletion_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_data_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_uuid" uuid,
	"visitor_email" text NOT NULL,
	"request_type" varchar(20),
	"status" varchar(20) DEFAULT 'pending',
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_uuid" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"persona_id" integer,
	"tool_calls" jsonb,
	"tool_results" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_by" varchar(20) DEFAULT 'ai',
	"human_user_id" text,
	"is_internal" boolean DEFAULT false,
	"model_provider" varchar(50),
	"model_name" varchar(100),
	"model_config" jsonb,
	"tokens_used" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_monitoring_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_uuid" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"actions_taken" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_personas" (
	"id" serial PRIMARY KEY NOT NULL,
	"embedded_chat_uuid" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"role" varchar(100),
	"instructions" text NOT NULL,
	"avatar_url" text,
	"contact_email" text,
	"contact_phone" text,
	"contact_calendar_link" text,
	"is_active" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"category" varchar(50),
	"config" jsonb NOT NULL,
	"preview_image_url" text,
	"is_premium" boolean DEFAULT false,
	"is_public" boolean DEFAULT false,
	"created_by" text,
	"install_count" integer DEFAULT 0,
	"rating" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"embedded_chat_uuid" uuid,
	"date" timestamp NOT NULL,
	"conversations" integer DEFAULT 0,
	"messages" integer DEFAULT 0,
	"tokens_used" jsonb DEFAULT '{}'::jsonb,
	"mcp_tool_calls" integer DEFAULT 0,
	"rag_queries" integer DEFAULT 0,
	"human_interventions" integer DEFAULT 0,
	"estimated_cost" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_usage_chat_date" UNIQUE("embedded_chat_uuid","date")
);
--> statement-breakpoint
-- ALTER TABLE "embedded_chats" DROP CONSTRAINT "embedded_chats_profile_uuid_profiles_uuid_fk"; -- Constraint doesn't exist
--> statement-breakpoint
DROP INDEX IF EXISTS "embedded_chats_profile_uuid_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "embedded_chats_is_public_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "embedded_chats_is_active_idx";--> statement-breakpoint
ALTER TABLE "embedded_chats" ALTER COLUMN "is_public" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "project_uuid" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "name" varchar(255) DEFAULT 'AI Assistant' NOT NULL;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "enabled_mcp_server_uuids" text[] DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "enable_rag" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "allowed_domains" text[] DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "contact_routing" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "custom_instructions" text;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "welcome_message" text;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "suggested_questions" text[] DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "theme_config" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "position" varchar(20) DEFAULT 'bottom-right';--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "install_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "last_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "model_config" jsonb DEFAULT '{
      "provider": "openai",
      "model": "gpt-4",
      "temperature": 0.7,
      "max_tokens": 1000,
      "top_p": 1.0,
      "frequency_penalty": 0.0,
      "presence_penalty": 0.0
    }'::jsonb;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "human_oversight" jsonb DEFAULT '{
      "enabled": false,
      "mode": "monitor",
      "notification_channels": ["app", "email"],
      "auto_assign": false,
      "business_hours": null
    }'::jsonb;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "context_window_size" integer DEFAULT 10;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "max_conversation_length" integer DEFAULT 100;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "offline_config" jsonb DEFAULT '{
      "enabled": true,
      "message": "We''ll get back to you soon!",
      "email_notification": true,
      "capture_contact": true
    }'::jsonb;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "api_key" varchar(64);--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "api_key_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "require_api_key" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "api_key_last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "embedded_chat_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "embedded_chat_uuid" uuid;--> statement-breakpoint
ALTER TABLE "chat_analytics" ADD CONSTRAINT "chat_analytics_embedded_chat_uuid_embedded_chats_uuid_fk" FOREIGN KEY ("embedded_chat_uuid") REFERENCES "public"."embedded_chats"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_billing" ADD CONSTRAINT "chat_billing_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_contacts" ADD CONSTRAINT "chat_contacts_conversation_uuid_chat_conversations_uuid_fk" FOREIGN KEY ("conversation_uuid") REFERENCES "public"."chat_conversations"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_contacts" ADD CONSTRAINT "chat_contacts_embedded_chat_uuid_embedded_chats_uuid_fk" FOREIGN KEY ("embedded_chat_uuid") REFERENCES "public"."embedded_chats"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_contacts" ADD CONSTRAINT "chat_contacts_persona_id_chat_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."chat_personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_embedded_chat_uuid_embedded_chats_uuid_fk" FOREIGN KEY ("embedded_chat_uuid") REFERENCES "public"."embedded_chats"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_data_requests" ADD CONSTRAINT "chat_data_requests_conversation_uuid_chat_conversations_uuid_fk" FOREIGN KEY ("conversation_uuid") REFERENCES "public"."chat_conversations"("uuid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_uuid_chat_conversations_uuid_fk" FOREIGN KEY ("conversation_uuid") REFERENCES "public"."chat_conversations"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_human_user_id_users_id_fk" FOREIGN KEY ("human_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_monitoring_sessions" ADD CONSTRAINT "chat_monitoring_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_monitoring_sessions" ADD CONSTRAINT "chat_monitoring_sessions_conversation_uuid_chat_conversations_uuid_fk" FOREIGN KEY ("conversation_uuid") REFERENCES "public"."chat_conversations"("uuid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_personas" ADD CONSTRAINT "chat_personas_embedded_chat_uuid_embedded_chats_uuid_fk" FOREIGN KEY ("embedded_chat_uuid") REFERENCES "public"."embedded_chats"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_templates" ADD CONSTRAINT "chat_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_usage" ADD CONSTRAINT "chat_usage_embedded_chat_uuid_embedded_chats_uuid_fk" FOREIGN KEY ("embedded_chat_uuid") REFERENCES "public"."embedded_chats"("uuid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_analytics_chat_date" ON "chat_analytics" USING btree ("embedded_chat_uuid","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_billing_user_period" ON "chat_billing" USING btree ("user_id","billing_period_start");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_chat" ON "chat_contacts" USING btree ("embedded_chat_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_status" ON "chat_contacts" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_created" ON "chat_contacts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_chat" ON "chat_conversations" USING btree ("embedded_chat_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_visitor" ON "chat_conversations" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_status" ON "chat_conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_assigned" ON "chat_conversations" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_heartbeat" ON "chat_conversations" USING btree ("last_heartbeat");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_conversation" ON "chat_messages" USING btree ("conversation_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_created" ON "chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_internal" ON "chat_messages" USING btree ("is_internal");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_monitoring_user" ON "chat_monitoring_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_monitoring_conversation" ON "chat_monitoring_sessions" USING btree ("conversation_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_personas_chat" ON "chat_personas" USING btree ("embedded_chat_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_personas_active" ON "chat_personas" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_templates_category" ON "chat_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_templates_public" ON "chat_templates" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_usage_chat_date" ON "chat_usage" USING btree ("embedded_chat_uuid","date");--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD CONSTRAINT "embedded_chats_project_uuid_projects_uuid_fk" FOREIGN KEY ("project_uuid") REFERENCES "public"."projects"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_embedded_chats_project" ON "embedded_chats" USING btree ("project_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_embedded_chats_public" ON "embedded_chats" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_embedded_chats_active" ON "embedded_chats" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_embedded_chats_api_key" ON "embedded_chats" USING btree ("api_key");--> statement-breakpoint
ALTER TABLE "embedded_chats" DROP COLUMN IF EXISTS "profile_uuid";--> statement-breakpoint
ALTER TABLE "embedded_chats" DROP COLUMN IF EXISTS "title";--> statement-breakpoint
ALTER TABLE "embedded_chats" DROP COLUMN IF EXISTS "description";--> statement-breakpoint
ALTER TABLE "embedded_chats" DROP COLUMN IF EXISTS "settings";--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD CONSTRAINT "embedded_chats_project_uuid_unique" UNIQUE("project_uuid");--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD CONSTRAINT "embedded_chats_api_key_unique" UNIQUE("api_key");