-- P0 Security Fix: Add unique constraint on OAuth tokens
-- Ensures only one token record per server, preventing token confusion
-- OWASP API2:2023 - Broken Authentication

-- Step 1: Remove duplicate token records (keep most recent per server)
DELETE FROM mcp_server_oauth_tokens
WHERE uuid IN (
  SELECT t1.uuid
  FROM mcp_server_oauth_tokens t1
  INNER JOIN (
    SELECT server_uuid, MAX(updated_at) as max_updated
    FROM mcp_server_oauth_tokens
    GROUP BY server_uuid
    HAVING COUNT(*) > 1
  ) t2 ON t1.server_uuid = t2.server_uuid
  WHERE t1.updated_at < t2.max_updated
);

-- Step 2: Add unique constraint on server_uuid
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mcp_server_oauth_tokens_server_uuid_unique'
  ) THEN
    ALTER TABLE mcp_server_oauth_tokens
      ADD CONSTRAINT mcp_server_oauth_tokens_server_uuid_unique
      UNIQUE (server_uuid);
  END IF;
END $$;
