-- Fix slug uniqueness constraint to be profile-scoped instead of global
-- This allows multiple profiles to use the same intuitive slug names

-- Remove the existing global uniqueness constraint
ALTER TABLE "mcp_servers" DROP CONSTRAINT "idx_mcp_servers_slug";--> statement-breakpoint

-- Add profile-scoped uniqueness constraint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_profile_slug_unique" UNIQUE("profile_uuid", "slug");