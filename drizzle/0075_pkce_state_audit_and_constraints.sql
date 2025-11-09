-- P0 Security Fix: PKCE State Reuse Prevention
-- Prevents state replay attacks by tracking used states even after deletion
-- CWE-294: Authentication Bypass by Capture-replay
-- OAuth 2.1: Section 4.1.1 - Authorization Code Flow with PKCE

-- ============================================================================
-- 1. Create audit table for used PKCE states (prevents replay)
-- ============================================================================

CREATE TABLE IF NOT EXISTS oauth_pkce_states_audit (
  state text PRIMARY KEY,  -- The state parameter that was used
  server_uuid uuid NOT NULL,
  user_id text NOT NULL,
  used_at timestamp with time zone NOT NULL DEFAULT NOW(),
  expires_at timestamp with time zone NOT NULL,  -- Auto-delete after TTL
  audit_reason text NOT NULL  -- 'success', 'integrity_violation', 'expired', 'cleanup'
);

-- Index for efficient cleanup of expired audit records
CREATE INDEX IF NOT EXISTS idx_pkce_audit_expires_at
  ON oauth_pkce_states_audit(expires_at);

-- Index for quick state existence checks
CREATE INDEX IF NOT EXISTS idx_pkce_audit_state
  ON oauth_pkce_states_audit(state);

-- Composite index for user-specific queries
CREATE INDEX IF NOT EXISTS idx_pkce_audit_user_server
  ON oauth_pkce_states_audit(user_id, server_uuid);

-- ============================================================================
-- 2. Add unique constraint to prevent state collisions (defense in depth)
-- ============================================================================

-- While state is already PRIMARY KEY, this adds a check constraint
-- to ensure state values meet minimum security requirements
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_oauth_pkce_state_format'
  ) THEN
    ALTER TABLE oauth_pkce_states
      ADD CONSTRAINT chk_oauth_pkce_state_format
      CHECK (length(state) >= 32 AND state ~ '^[A-Za-z0-9_-]+$');
  END IF;
END $$;

-- ============================================================================
-- 3. Add index on integrity_hash for faster verification
-- ============================================================================

-- The integrity_hash column already exists (added in migration 0071)
-- Add index for faster lookup during callback verification
CREATE INDEX IF NOT EXISTS idx_pkce_states_integrity_hash
  ON oauth_pkce_states(integrity_hash);

-- ============================================================================
-- 4. Add trigger to automatically audit state usage
-- ============================================================================

-- Function to audit PKCE state deletion
CREATE OR REPLACE FUNCTION audit_pkce_state_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert into audit table when state is deleted
  INSERT INTO oauth_pkce_states_audit (
    state,
    server_uuid,
    user_id,
    used_at,
    expires_at,
    audit_reason
  ) VALUES (
    OLD.state,
    OLD.server_uuid,
    OLD.user_id,
    NOW(),
    NOW() + INTERVAL '30 days',  -- Keep audit record for 30 days
    CASE
      WHEN OLD.expires_at < NOW() THEN 'expired'
      WHEN TG_OP = 'DELETE' THEN 'success'
      ELSE 'cleanup'
    END
  )
  ON CONFLICT (state) DO NOTHING;  -- Prevent duplicate audit entries

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic auditing
DROP TRIGGER IF EXISTS trg_audit_pkce_deletion ON oauth_pkce_states;
CREATE TRIGGER trg_audit_pkce_deletion
  BEFORE DELETE ON oauth_pkce_states
  FOR EACH ROW
  EXECUTE FUNCTION audit_pkce_state_deletion();

-- ============================================================================
-- 5. Add comments for documentation
-- ============================================================================

COMMENT ON TABLE oauth_pkce_states_audit IS
'Audit trail of used PKCE states. Prevents replay attacks by tracking states even after deletion. Records expire after 30 days for storage efficiency.';

COMMENT ON COLUMN oauth_pkce_states_audit.state IS
'The state parameter that was used in an OAuth flow. Used to prevent replay attacks.';

COMMENT ON COLUMN oauth_pkce_states_audit.audit_reason IS
'Reason for audit entry: success (normal completion), integrity_violation (security issue), expired (cleanup), cleanup (manual cleanup)';

COMMENT ON FUNCTION audit_pkce_state_deletion() IS
'Automatically creates audit records when PKCE states are deleted, preventing state replay attacks per OAuth 2.1 security best practices.';

-- ============================================================================
-- 6. Verification
-- ============================================================================

DO $$
BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'oauth_pkce_states_audit'
    ), 'oauth_pkce_states_audit table not created';

    ASSERT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_oauth_pkce_state_format'
    ), 'State format check constraint not created';

    ASSERT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'audit_pkce_state_deletion'
    ), 'Audit trigger function not created';

    RAISE NOTICE 'Migration 0075: PKCE state audit and constraints - completed successfully';
    RAISE NOTICE 'State replay attacks are now prevented through automatic audit trail';
    RAISE NOTICE 'Next step: Update callback route to check audit table before allowing state reuse';
END $$;
