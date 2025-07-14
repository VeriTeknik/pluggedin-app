-- Add claim fields to shared_mcp_servers table
ALTER TABLE shared_mcp_servers
ADD COLUMN IF NOT EXISTS is_claimed BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN IF NOT EXISTS claimed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS registry_server_uuid UUID REFERENCES registry_servers(uuid) ON DELETE SET NULL;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_shared_mcp_servers_is_claimed ON shared_mcp_servers(is_claimed);
CREATE INDEX IF NOT EXISTS idx_shared_mcp_servers_claimed_by_user_id ON shared_mcp_servers(claimed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_shared_mcp_servers_registry_server_uuid ON shared_mcp_servers(registry_server_uuid);

-- Add comment to explain the purpose
COMMENT ON COLUMN shared_mcp_servers.is_claimed IS 'Whether this community server has been claimed by its owner';
COMMENT ON COLUMN shared_mcp_servers.claimed_by_user_id IS 'User who claimed ownership of this server';
COMMENT ON COLUMN shared_mcp_servers.claimed_at IS 'Timestamp when the server was claimed';
COMMENT ON COLUMN shared_mcp_servers.registry_server_uuid IS 'Link to the registry entry after claiming';