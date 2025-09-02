-- Fix the unique constraint on slug to be scoped by profile_uuid
-- This allows the same slug to exist across different profiles while maintaining uniqueness within a profile

-- Drop the existing unique index
DROP INDEX IF EXISTS idx_mcp_servers_slug;

-- Create a new unique index that includes profile_uuid
-- This ensures slugs are unique within a profile but can be reused across profiles
CREATE UNIQUE INDEX idx_mcp_servers_profile_slug ON mcp_servers(profile_uuid, slug) WHERE slug IS NOT NULL;

-- Add comment explaining the constraint
COMMENT ON INDEX idx_mcp_servers_profile_slug IS 'Ensures slug uniqueness within a profile while allowing the same slug across different profiles';