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
	"follower_user_id" text NOT NULL, -- Changed name and type
	"followed_user_id" text NOT NULL, -- Changed name and type
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
	-- Removed inline constraint, will add later
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Removed ALTER TABLE profiles ADD COLUMN ... for social fields
--> statement-breakpoint
-- Add social columns to users table instead (using IF NOT EXISTS for idempotency)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "language" language DEFAULT 'en';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD CONSTRAINT "embedded_chats_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Add NEW foreign keys for followers table (referencing users)
ALTER TABLE "followers" ADD CONSTRAINT "followers_follower_user_id_users_id_fk" FOREIGN KEY ("follower_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followers" ADD CONSTRAINT "followers_followed_user_id_users_id_fk" FOREIGN KEY ("followed_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Add NEW unique constraint for followers table
ALTER TABLE "followers" ADD CONSTRAINT "followers_unique_user_relationship_idx" UNIQUE("follower_user_id","followed_user_id");--> statement-breakpoint
ALTER TABLE "shared_collections" ADD CONSTRAINT "shared_collections_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mcp_servers" ADD CONSTRAINT "shared_mcp_servers_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mcp_servers" ADD CONSTRAINT "shared_mcp_servers_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "embedded_chats_profile_uuid_idx" ON "embedded_chats" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "embedded_chats_is_public_idx" ON "embedded_chats" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "embedded_chats_is_active_idx" ON "embedded_chats" USING btree ("is_active");--> statement-breakpoint
-- Create NEW indices for followers table
CREATE INDEX "followers_follower_user_id_idx" ON "followers" USING btree ("follower_user_id");--> statement-breakpoint
CREATE INDEX "followers_followed_user_id_idx" ON "followers" USING btree ("followed_user_id");--> statement-breakpoint
CREATE INDEX "shared_collections_profile_uuid_idx" ON "shared_collections" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "shared_collections_is_public_idx" ON "shared_collections" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "shared_mcp_servers_profile_uuid_idx" ON "shared_mcp_servers" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "shared_mcp_servers_server_uuid_idx" ON "shared_mcp_servers" USING btree ("server_uuid");--> statement-breakpoint
CREATE INDEX "shared_mcp_servers_is_public_idx" ON "shared_mcp_servers" USING btree ("is_public");
-- Removed index and unique constraint creation for profiles.username
