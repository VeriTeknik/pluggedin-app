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
	"follower_profile_uuid" uuid NOT NULL,
	"followed_profile_uuid" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "followers_unique_relationship_idx" UNIQUE("follower_profile_uuid","followed_profile_uuid")
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
ALTER TABLE "profiles" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD CONSTRAINT "embedded_chats_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followers" ADD CONSTRAINT "followers_follower_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("follower_profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followers" ADD CONSTRAINT "followers_followed_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("followed_profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_collections" ADD CONSTRAINT "shared_collections_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mcp_servers" ADD CONSTRAINT "shared_mcp_servers_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mcp_servers" ADD CONSTRAINT "shared_mcp_servers_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "embedded_chats_profile_uuid_idx" ON "embedded_chats" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "embedded_chats_is_public_idx" ON "embedded_chats" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "embedded_chats_is_active_idx" ON "embedded_chats" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "followers_follower_profile_uuid_idx" ON "followers" USING btree ("follower_profile_uuid");--> statement-breakpoint
CREATE INDEX "followers_followed_profile_uuid_idx" ON "followers" USING btree ("followed_profile_uuid");--> statement-breakpoint
CREATE INDEX "shared_collections_profile_uuid_idx" ON "shared_collections" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "shared_collections_is_public_idx" ON "shared_collections" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "shared_mcp_servers_profile_uuid_idx" ON "shared_mcp_servers" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "shared_mcp_servers_server_uuid_idx" ON "shared_mcp_servers" USING btree ("server_uuid");--> statement-breakpoint
CREATE INDEX "shared_mcp_servers_is_public_idx" ON "shared_mcp_servers" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "profiles_username_idx" ON "profiles" USING btree ("username");--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_username_unique" UNIQUE("username");