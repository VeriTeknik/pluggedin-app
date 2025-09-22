-- Add slug field to mcp_servers table for slug-based tool prefixing
ALTER TABLE mcp_servers ADD COLUMN slug TEXT;

-- Create unique index on slug to ensure uniqueness
CREATE UNIQUE INDEX idx_mcp_servers_slug ON mcp_servers(slug);

-- Add check constraint to ensure slug is not empty and follows slug format
ALTER TABLE mcp_servers ADD CONSTRAINT chk_mcp_servers_slug_format
  CHECK (slug IS NULL OR (length(slug) > 0 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'));

-- Add comment explaining the slug field
COMMENT ON COLUMN mcp_servers.slug IS 'URL-friendly identifier for the MCP server, used for slug-based tool prefixing to resolve name collisions';