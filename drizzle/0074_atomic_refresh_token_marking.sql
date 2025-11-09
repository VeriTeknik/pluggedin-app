-- P0 Security Fix: Atomic Refresh Token Marking (Race Condition Prevention)
-- Prevents concurrent refresh token usage through optimistic locking
-- CWE-362: Concurrent Execution using Shared Resource with Improper Synchronization
-- OAuth 2.1: Section 6.1 - Refresh Token Rotation

-- Add locked_at column for optimistic locking during token refresh
-- This prevents concurrent refresh attempts from both passing the reuse check
ALTER TABLE mcp_server_oauth_tokens
ADD COLUMN IF NOT EXISTS refresh_token_locked_at timestamp with time zone;

-- Add index for efficient lookups combining server_uuid and refresh_token_used_at
-- This optimizes the common query pattern: "find active token for server X"
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_server_refresh_status
  ON mcp_server_oauth_tokens(server_uuid, refresh_token_used_at, refresh_token_locked_at);

-- Add index on (server_uuid, refresh_token_used_at) for fast reuse detection
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_server_used_at
  ON mcp_server_oauth_tokens(server_uuid, refresh_token_used_at)
  WHERE refresh_token_used_at IS NOT NULL;

-- Comment explaining the optimistic locking strategy
COMMENT ON COLUMN mcp_server_oauth_tokens.refresh_token_locked_at IS
'Timestamp when refresh token was locked for refresh operation. Used for optimistic locking to prevent race conditions. Should be NULL for tokens not currently being refreshed.';

COMMENT ON COLUMN mcp_server_oauth_tokens.refresh_token_used_at IS
'Timestamp when refresh token was successfully used and marked as consumed. Per OAuth 2.1, any reuse attempt after this is marked should result in token revocation.';

-- Verification
DO $$
BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'mcp_server_oauth_tokens'
        AND column_name = 'refresh_token_locked_at'
    ), 'refresh_token_locked_at column not created';

    RAISE NOTICE 'Migration 0074: Atomic refresh token marking - completed successfully';
    RAISE NOTICE 'Next step: Update token-refresh-service.ts to use optimistic locking';
END $$;
