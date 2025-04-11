-- Add "COMMUNITY" to the mcp_server_source enum type
ALTER TYPE mcp_server_source ADD VALUE 'COMMUNITY';

-- Update search_cache table to allow using the new value
-- This ensures existing rows won't conflict with the new enum value
-- (This is optional but good practice)
DELETE FROM search_cache WHERE expires_at < NOW();

-- Add comment to explain the purpose
COMMENT ON TYPE mcp_server_source IS 'Enum for MCP server sources including community-shared servers'; 