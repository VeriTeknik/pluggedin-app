-- Add social fields to profiles table
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "username" text UNIQUE;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "bio" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT false NOT NULL;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "avatar_url" text;

-- Create index for username on profiles table
CREATE INDEX IF NOT EXISTS "profiles_username_idx" ON "profiles" ("username");

-- Create followers table
CREATE TABLE IF NOT EXISTS "followers" (
  "uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "follower_profile_uuid" uuid NOT NULL REFERENCES "profiles"("uuid") ON DELETE CASCADE,
  "followed_profile_uuid" uuid NOT NULL REFERENCES "profiles"("uuid") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indices for followers table
CREATE INDEX IF NOT EXISTS "followers_follower_profile_uuid_idx" ON "followers" ("follower_profile_uuid");
CREATE INDEX IF NOT EXISTS "followers_followed_profile_uuid_idx" ON "followers" ("followed_profile_uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "followers_unique_relationship_idx" ON "followers" ("follower_profile_uuid", "followed_profile_uuid");

-- Create shared_mcp_servers table
CREATE TABLE IF NOT EXISTS "shared_mcp_servers" (
  "uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_uuid" uuid NOT NULL REFERENCES "profiles"("uuid") ON DELETE CASCADE,
  "server_uuid" uuid NOT NULL REFERENCES "mcp_servers"("uuid") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "is_public" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indices for shared_mcp_servers table
CREATE INDEX IF NOT EXISTS "shared_mcp_servers_profile_uuid_idx" ON "shared_mcp_servers" ("profile_uuid");
CREATE INDEX IF NOT EXISTS "shared_mcp_servers_server_uuid_idx" ON "shared_mcp_servers" ("server_uuid");
CREATE INDEX IF NOT EXISTS "shared_mcp_servers_is_public_idx" ON "shared_mcp_servers" ("is_public");

-- Create shared_collections table
CREATE TABLE IF NOT EXISTS "shared_collections" (
  "uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_uuid" uuid NOT NULL REFERENCES "profiles"("uuid") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "content" jsonb NOT NULL,
  "is_public" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indices for shared_collections table
CREATE INDEX IF NOT EXISTS "shared_collections_profile_uuid_idx" ON "shared_collections" ("profile_uuid");
CREATE INDEX IF NOT EXISTS "shared_collections_is_public_idx" ON "shared_collections" ("is_public");

-- Create embedded_chats table
CREATE TABLE IF NOT EXISTS "embedded_chats" (
  "uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_uuid" uuid NOT NULL REFERENCES "profiles"("uuid") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_public" boolean NOT NULL DEFAULT true,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indices for embedded_chats table
CREATE INDEX IF NOT EXISTS "embedded_chats_profile_uuid_idx" ON "embedded_chats" ("profile_uuid");
CREATE INDEX IF NOT EXISTS "embedded_chats_is_public_idx" ON "embedded_chats" ("is_public");
CREATE INDEX IF NOT EXISTS "embedded_chats_is_active_idx" ON "embedded_chats" ("is_active"); 