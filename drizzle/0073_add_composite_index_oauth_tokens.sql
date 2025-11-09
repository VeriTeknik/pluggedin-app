-- P0 Performance: Add composite index for efficient token expiration queries
-- Optimizes queries that check if a specific server's token is expired

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_server_expires
  ON mcp_server_oauth_tokens(server_uuid, expires_at);
