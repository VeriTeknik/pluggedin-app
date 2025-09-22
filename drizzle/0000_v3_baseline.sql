CREATE TYPE "public"."language" AS ENUM('en', 'tr', 'nl', 'zh', 'ja', 'hi');--> statement-breakpoint
CREATE TYPE "public"."mcp_server_source" AS ENUM('PLUGGEDIN', 'COMMUNITY', 'REGISTRY');--> statement-breakpoint
CREATE TYPE "public"."mcp_server_status" AS ENUM('ACTIVE', 'INACTIVE', 'SUGGESTED', 'DECLINED');--> statement-breakpoint
CREATE TYPE "public"."mcp_server_type" AS ENUM('STDIO', 'SSE', 'STREAMABLE_HTTP');--> statement-breakpoint
CREATE TYPE "public"."profile_capability" AS ENUM('TOOLS_MANAGEMENT');--> statement-breakpoint
CREATE TYPE "public"."toggle_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	"last_used" timestamp with time zone,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"details" jsonb DEFAULT '{}'::jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_uuid" uuid NOT NULL,
	"api_key" text NOT NULL,
	"name" text DEFAULT 'API Key',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_api_key_unique" UNIQUE("api_key")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_uuid" uuid,
	"type" text NOT NULL,
	"action" text NOT NULL,
	"request_path" text,
	"request_method" text,
	"request_body" jsonb,
	"response_status" integer,
	"response_time_ms" integer,
	"user_agent" text,
	"ip_address" text,
	"server_uuid" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "codes" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_instructions" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mcp_server_uuid" uuid NOT NULL,
	"description" text DEFAULT 'Custom instructions for this server',
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_instructions_mcp_server_uuid_unique" UNIQUE("mcp_server_uuid")
);
--> statement-breakpoint
CREATE TABLE "custom_mcp_servers" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"code_uuid" uuid NOT NULL,
	"additional_args" text[] DEFAULT '{}'::text[] NOT NULL,
	"env" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"status" "mcp_server_status" DEFAULT 'ACTIVE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "docs" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"project_uuid" uuid,
	"profile_uuid" uuid,
	"name" text NOT NULL,
	"description" text,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"file_path" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[],
	"rag_document_id" text,
	"source" text DEFAULT 'upload' NOT NULL,
	"ai_metadata" jsonb,
	"upload_metadata" jsonb,
	"content_hash" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_model_attributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"model_name" text NOT NULL,
	"model_provider" text NOT NULL,
	"contribution_type" text NOT NULL,
	"contribution_timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"contribution_metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"content" text NOT NULL,
	"file_path" text,
	"is_current" boolean DEFAULT false,
	"rag_document_id" text,
	"content_diff" jsonb,
	"created_by_model" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"change_summary" text
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"content" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true,
	"created_by" text NOT NULL,
	"updated_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "email_tracking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"email_type" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now(),
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"segment" text,
	"variant" text,
	"subject" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "embedded_chats" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "followers" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_user_id" text NOT NULL,
	"followed_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "followers_unique_user_relationship_idx" UNIQUE("follower_user_id","followed_user_id")
);
--> statement-breakpoint
CREATE TABLE "mcp_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"server_uuid" uuid,
	"external_id" text,
	"source" text NOT NULL,
	"action" text NOT NULL,
	"item_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_oauth_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"server_uuid" uuid NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"callback_url" text NOT NULL,
	"provider" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mcp_oauth_sessions_state_unique" UNIQUE("state")
);
--> statement-breakpoint
CREATE TABLE "mcp_servers" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" "mcp_server_type" DEFAULT 'STDIO' NOT NULL,
	"command" text,
	"args" text[],
	"env" jsonb,
	"url" text,
	"command_encrypted" text,
	"args_encrypted" text,
	"env_encrypted" text,
	"url_encrypted" text,
	"transport_encrypted" text,
	"streamable_http_options_encrypted" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"status" "mcp_server_status" DEFAULT 'ACTIVE' NOT NULL,
	"source" "mcp_server_source" DEFAULT 'PLUGGEDIN' NOT NULL,
	"external_id" text,
	"notes" text,
	"config" jsonb,
	"slug" text,
	CONSTRAINT "mcp_servers_profile_slug_unique" UNIQUE("profile_uuid","slug")
);
--> statement-breakpoint
CREATE TABLE "mcp_sessions" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"server_uuid" uuid NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"session_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_activity" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_uuid" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"link" text,
	"severity" text,
	"completed" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"identifier" text NOT NULL,
	"token" text PRIMARY KEY NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playground_settings" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"provider" text DEFAULT 'anthropic' NOT NULL,
	"model" text DEFAULT 'claude-3-7-sonnet-20250219' NOT NULL,
	"temperature" integer DEFAULT 0 NOT NULL,
	"max_tokens" integer DEFAULT 1000 NOT NULL,
	"log_level" text DEFAULT 'info' NOT NULL,
	"rag_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playground_settings_profile_uuid_unique" UNIQUE("profile_uuid")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"project_uuid" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"language" "language" DEFAULT 'en',
	"enabled_capabilities" "profile_capability"[] DEFAULT '{}'::profile_capability[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active_profile_uuid" uuid,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mcp_server_uuid" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"arguments_schema" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompts_unique_prompt_name_per_server_idx" UNIQUE("mcp_server_uuid","name")
);
--> statement-breakpoint
CREATE TABLE "registry_oauth_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"session_token_hash" varchar(64) NOT NULL,
	"oauth_token" text NOT NULL,
	"github_username" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "registry_oauth_sessions_session_token_hash_unique" UNIQUE("session_token_hash")
);
--> statement-breakpoint
CREATE TABLE "registry_servers" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registry_id" text,
	"name" text NOT NULL,
	"github_owner" text NOT NULL,
	"github_repo" text NOT NULL,
	"repository_url" text NOT NULL,
	"description" text,
	"is_claimed" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"claimed_by_user_id" text,
	"claimed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registry_servers_registry_id_unique" UNIQUE("registry_id")
);
--> statement-breakpoint
CREATE TABLE "release_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"repository" text NOT NULL,
	"version" text NOT NULL,
	"release_date" timestamp with time zone NOT NULL,
	"content" jsonb NOT NULL,
	"commit_sha" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_templates" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mcp_server_uuid" uuid NOT NULL,
	"uri_template" text NOT NULL,
	"name" text,
	"description" text,
	"mime_type" text,
	"template_variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mcp_server_uuid" uuid NOT NULL,
	"uri" text NOT NULL,
	"name" text,
	"description" text,
	"mime_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "toggle_status" DEFAULT 'ACTIVE' NOT NULL,
	CONSTRAINT "resources_unique_uri_per_server_idx" UNIQUE("mcp_server_uuid","uri")
);
--> statement-breakpoint
CREATE TABLE "scheduled_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"email_type" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"sent" boolean DEFAULT false,
	"sent_at" timestamp with time zone,
	"cancelled" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "search_cache" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "mcp_server_source" NOT NULL,
	"query" text NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_claim_requests" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_uuid" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"github_username" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "server_installations" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_uuid" uuid,
	"external_id" text,
	"source" "mcp_server_source" NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_reviews" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_source" "mcp_server_source" NOT NULL,
	"server_external_id" text NOT NULL,
	"user_id" text NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_reviews_unique_user_server_idx" UNIQUE("user_id","server_source","server_external_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_collections" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"content" jsonb NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_mcp_servers" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"server_uuid" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"template" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requires_credentials" boolean DEFAULT false NOT NULL,
	"is_claimed" boolean DEFAULT false NOT NULL,
	"claimed_by_user_id" text,
	"claimed_at" timestamp with time zone,
	"registry_server_uuid" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tools" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"tool_schema" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mcp_server_uuid" uuid NOT NULL,
	"status" "toggle_status" DEFAULT 'ACTIVE' NOT NULL,
	CONSTRAINT "tools_unique_tool_name_per_server_idx" UNIQUE("mcp_server_uuid","name")
);
--> statement-breakpoint
CREATE TABLE "transport_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_uuid" uuid NOT NULL,
	"transport_type" varchar(50) NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unsubscribe_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unsubscribe_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user_email_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"welcome_emails" boolean DEFAULT true,
	"product_updates" boolean DEFAULT true,
	"marketing_emails" boolean DEFAULT false,
	"admin_notifications" boolean DEFAULT true,
	"notification_severity" text DEFAULT 'ALERT,CRITICAL',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"password" text,
	"email_verified" timestamp,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"username" text,
	"bio" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"language" "language" DEFAULT 'en',
	"avatar_url" text,
	"failed_login_attempts" integer DEFAULT 0,
	"account_locked_until" timestamp,
	"last_login_at" timestamp,
	"last_login_ip" text,
	"password_changed_at" timestamp,
	"is_admin" boolean DEFAULT false NOT NULL,
	"requires_2fa" boolean DEFAULT false NOT NULL,
	"two_fa_secret" text,
	"two_fa_backup_codes" text,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_uuid_projects_uuid_fk" FOREIGN KEY ("project_uuid") REFERENCES "public"."projects"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codes" ADD CONSTRAINT "codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_instructions" ADD CONSTRAINT "custom_instructions_mcp_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("mcp_server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_mcp_servers" ADD CONSTRAINT "custom_mcp_servers_code_uuid_codes_uuid_fk" FOREIGN KEY ("code_uuid") REFERENCES "public"."codes"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_mcp_servers" ADD CONSTRAINT "custom_mcp_servers_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "docs" ADD CONSTRAINT "docs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "docs" ADD CONSTRAINT "docs_project_uuid_projects_uuid_fk" FOREIGN KEY ("project_uuid") REFERENCES "public"."projects"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "docs" ADD CONSTRAINT "docs_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_model_attributions" ADD CONSTRAINT "document_model_attributions_document_id_docs_uuid_fk" FOREIGN KEY ("document_id") REFERENCES "public"."docs"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_docs_uuid_fk" FOREIGN KEY ("document_id") REFERENCES "public"."docs"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_tracking" ADD CONSTRAINT "email_tracking_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD CONSTRAINT "embedded_chats_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followers" ADD CONSTRAINT "followers_follower_user_id_users_id_fk" FOREIGN KEY ("follower_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followers" ADD CONSTRAINT "followers_followed_user_id_users_id_fk" FOREIGN KEY ("followed_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_sessions" ADD CONSTRAINT "mcp_sessions_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_sessions" ADD CONSTRAINT "mcp_sessions_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_settings" ADD CONSTRAINT "playground_settings_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_project_uuid_projects_uuid_fk" FOREIGN KEY ("project_uuid") REFERENCES "public"."projects"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_mcp_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("mcp_server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_oauth_sessions" ADD CONSTRAINT "registry_oauth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_servers" ADD CONSTRAINT "registry_servers_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_templates" ADD CONSTRAINT "resource_templates_mcp_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("mcp_server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_mcp_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("mcp_server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_claim_requests" ADD CONSTRAINT "server_claim_requests_server_uuid_registry_servers_uuid_fk" FOREIGN KEY ("server_uuid") REFERENCES "public"."registry_servers"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_claim_requests" ADD CONSTRAINT "server_claim_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_installations" ADD CONSTRAINT "server_installations_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_installations" ADD CONSTRAINT "server_installations_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_reviews" ADD CONSTRAINT "server_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_collections" ADD CONSTRAINT "shared_collections_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mcp_servers" ADD CONSTRAINT "shared_mcp_servers_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mcp_servers" ADD CONSTRAINT "shared_mcp_servers_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mcp_servers" ADD CONSTRAINT "shared_mcp_servers_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mcp_servers" ADD CONSTRAINT "shared_mcp_servers_registry_server_uuid_registry_servers_uuid_fk" FOREIGN KEY ("registry_server_uuid") REFERENCES "public"."registry_servers"("uuid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_mcp_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("mcp_server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_configs" ADD CONSTRAINT "transport_configs_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unsubscribe_tokens" ADD CONSTRAINT "unsubscribe_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_email_preferences" ADD CONSTRAINT "user_email_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_admin_audit_log_admin" ON "admin_audit_log" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "idx_admin_audit_log_action" ON "admin_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_admin_audit_log_created" ON "admin_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "api_keys_project_uuid_idx" ON "api_keys" USING btree ("project_uuid");--> statement-breakpoint
CREATE INDEX "audit_logs_profile_uuid_idx" ON "audit_logs" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "audit_logs_type_idx" ON "audit_logs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "codes_user_id_idx" ON "codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "custom_mcp_servers_status_idx" ON "custom_mcp_servers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "custom_mcp_servers_profile_uuid_idx" ON "custom_mcp_servers" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "docs_user_id_idx" ON "docs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "docs_project_uuid_idx" ON "docs" USING btree ("project_uuid");--> statement-breakpoint
CREATE INDEX "docs_profile_uuid_idx" ON "docs" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "docs_name_idx" ON "docs" USING btree ("name");--> statement-breakpoint
CREATE INDEX "docs_created_at_idx" ON "docs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "docs_source_idx" ON "docs" USING btree ("source");--> statement-breakpoint
CREATE INDEX "docs_visibility_idx" ON "docs" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "docs_content_hash_idx" ON "docs" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "docs_parent_document_id_idx" ON "docs" USING btree ("parent_document_id");--> statement-breakpoint
CREATE INDEX "document_model_attributions_document_id_idx" ON "document_model_attributions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_model_attributions_model_idx" ON "document_model_attributions" USING btree ("model_name","model_provider");--> statement-breakpoint
CREATE INDEX "document_model_attributions_timestamp_idx" ON "document_model_attributions" USING btree ("contribution_timestamp");--> statement-breakpoint
CREATE INDEX "document_versions_document_id_idx" ON "document_versions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_versions_composite_idx" ON "document_versions" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE INDEX "idx_email_templates_category" ON "email_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_email_templates_active" ON "email_templates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_email_templates_created_by" ON "email_templates" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_email_templates_parent_id" ON "email_templates" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_email_tracking_user_id" ON "email_tracking" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_email_tracking_email_type" ON "email_tracking" USING btree ("email_type");--> statement-breakpoint
CREATE INDEX "idx_email_tracking_sent_at" ON "email_tracking" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "embedded_chats_profile_uuid_idx" ON "embedded_chats" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "embedded_chats_is_public_idx" ON "embedded_chats" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "embedded_chats_is_active_idx" ON "embedded_chats" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "followers_follower_user_id_idx" ON "followers" USING btree ("follower_user_id");--> statement-breakpoint
CREATE INDEX "followers_followed_user_id_idx" ON "followers" USING btree ("followed_user_id");--> statement-breakpoint
CREATE INDEX "idx_server_activity" ON "mcp_activity" USING btree ("server_uuid","source","created_at");--> statement-breakpoint
CREATE INDEX "idx_external_activity" ON "mcp_activity" USING btree ("external_id","source","created_at");--> statement-breakpoint
CREATE INDEX "idx_action_time" ON "mcp_activity" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "idx_mcp_oauth_sessions_state" ON "mcp_oauth_sessions" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_mcp_oauth_sessions_expires_at" ON "mcp_oauth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "mcp_servers_status_idx" ON "mcp_servers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mcp_servers_profile_uuid_idx" ON "mcp_servers" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "mcp_servers_type_idx" ON "mcp_servers" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_mcp_servers_profile_status" ON "mcp_servers" USING btree ("profile_uuid","status");--> statement-breakpoint
CREATE INDEX "idx_mcp_sessions_server_uuid" ON "mcp_sessions" USING btree ("server_uuid");--> statement-breakpoint
CREATE INDEX "idx_mcp_sessions_expires_at" ON "mcp_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_mcp_sessions_profile_uuid" ON "mcp_sessions" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "notifications_profile_uuid_idx" ON "notifications" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "notifications_read_idx" ON "notifications" USING btree ("read");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_profile_read_created" ON "notifications" USING btree ("profile_uuid","read","created_at");--> statement-breakpoint
CREATE INDEX "playground_settings_profile_uuid_idx" ON "playground_settings" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "profiles_project_uuid_idx" ON "profiles" USING btree ("project_uuid");--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "prompts_mcp_server_uuid_idx" ON "prompts" USING btree ("mcp_server_uuid");--> statement-breakpoint
CREATE INDEX "idx_registry_oauth_sessions_user_id" ON "registry_oauth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_registry_oauth_sessions_token_hash" ON "registry_oauth_sessions" USING btree ("session_token_hash");--> statement-breakpoint
CREATE INDEX "idx_registry_oauth_sessions_expires_at" ON "registry_oauth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "registry_servers_github_idx" ON "registry_servers" USING btree ("github_owner","github_repo");--> statement-breakpoint
CREATE INDEX "registry_servers_claimed_by_idx" ON "registry_servers" USING btree ("claimed_by_user_id");--> statement-breakpoint
CREATE INDEX "registry_servers_is_published_idx" ON "registry_servers" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "resource_templates_mcp_server_uuid_idx" ON "resource_templates" USING btree ("mcp_server_uuid");--> statement-breakpoint
CREATE INDEX "resources_mcp_server_uuid_idx" ON "resources" USING btree ("mcp_server_uuid");--> statement-breakpoint
CREATE INDEX "resources_status_idx" ON "resources" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_scheduled_emails_scheduled_for" ON "scheduled_emails" USING btree ("scheduled_for") WHERE sent = false AND cancelled = false;--> statement-breakpoint
CREATE INDEX "idx_scheduled_emails_user_id" ON "scheduled_emails" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "search_cache_source_query_idx" ON "search_cache" USING btree ("source","query");--> statement-breakpoint
CREATE INDEX "search_cache_expires_at_idx" ON "search_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "server_claim_requests_server_idx" ON "server_claim_requests" USING btree ("server_uuid");--> statement-breakpoint
CREATE INDEX "server_claim_requests_user_idx" ON "server_claim_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "server_claim_requests_status_idx" ON "server_claim_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "server_installations_server_uuid_idx" ON "server_installations" USING btree ("server_uuid");--> statement-breakpoint
CREATE INDEX "server_installations_external_id_source_idx" ON "server_installations" USING btree ("external_id","source");--> statement-breakpoint
CREATE INDEX "server_installations_profile_uuid_idx" ON "server_installations" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "idx_server_installations_profile_server" ON "server_installations" USING btree ("profile_uuid","server_uuid");--> statement-breakpoint
CREATE INDEX "server_reviews_source_external_id_idx" ON "server_reviews" USING btree ("server_source","server_external_id");--> statement-breakpoint
CREATE INDEX "server_reviews_user_id_idx" ON "server_reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shared_collections_profile_uuid_idx" ON "shared_collections" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "shared_collections_is_public_idx" ON "shared_collections" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "shared_mcp_servers_profile_uuid_idx" ON "shared_mcp_servers" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "shared_mcp_servers_server_uuid_idx" ON "shared_mcp_servers" USING btree ("server_uuid");--> statement-breakpoint
CREATE INDEX "shared_mcp_servers_is_public_idx" ON "shared_mcp_servers" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "shared_mcp_servers_is_claimed_idx" ON "shared_mcp_servers" USING btree ("is_claimed");--> statement-breakpoint
CREATE INDEX "shared_mcp_servers_claimed_by_idx" ON "shared_mcp_servers" USING btree ("claimed_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_shared_mcp_servers_public_profile" ON "shared_mcp_servers" USING btree ("is_public","profile_uuid");--> statement-breakpoint
CREATE INDEX "idx_shared_mcp_servers_public_created" ON "shared_mcp_servers" USING btree ("is_public","created_at");--> statement-breakpoint
CREATE INDEX "tools_mcp_server_uuid_idx" ON "tools" USING btree ("mcp_server_uuid");--> statement-breakpoint
CREATE INDEX "tools_status_idx" ON "tools" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_transport_configs_server_uuid" ON "transport_configs" USING btree ("server_uuid");--> statement-breakpoint
CREATE INDEX "idx_unsubscribe_tokens_token" ON "unsubscribe_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_unsubscribe_tokens_user" ON "unsubscribe_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_unsubscribe_tokens_expires" ON "unsubscribe_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "users_username_idx" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");