-- Add MCP sessions table for Streamable HTTP transport
CREATE TABLE IF NOT EXISTS mcp_sessions (
  id VARCHAR(128) PRIMARY KEY,
  server_uuid UUID NOT NULL REFERENCES mcp_servers(uuid) ON DELETE CASCADE,
  profile_uuid UUID NOT NULL REFERENCES profiles(uuid) ON DELETE CASCADE,
  session_data JSONB NOT NULL DEFAULT '{}',
  last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_mcp_sessions_server_uuid ON mcp_sessions(server_uuid);
CREATE INDEX IF NOT EXISTS idx_mcp_sessions_expires_at ON mcp_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_mcp_sessions_profile_uuid ON mcp_sessions(profile_uuid);

-- Add transport configurations table
CREATE TABLE IF NOT EXISTS transport_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_uuid UUID NOT NULL REFERENCES mcp_servers(uuid) ON DELETE CASCADE,
  transport_type VARCHAR(50) NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transport_configs_server_uuid ON transport_configs(server_uuid);

-- Create function to cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_mcp_sessions() 
RETURNS void AS $$
BEGIN
  DELETE FROM mcp_sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON TABLE mcp_sessions IS 'Stores session data for Streamable HTTP MCP connections';
COMMENT ON TABLE transport_configs IS 'Stores transport-specific configurations for MCP servers';