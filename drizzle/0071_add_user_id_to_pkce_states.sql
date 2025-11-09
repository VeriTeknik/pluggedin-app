-- P0 Security Fix: Authorization Code Injection Prevention
-- Add user_id to PKCE states to prevent cross-user OAuth flow hijacking
-- CWE-639: Authorization Bypass Through User-Controlled Key
-- OWASP API1:2023 - Broken Object Level Authorization

-- Add user_id column (initially nullable for existing rows)
ALTER TABLE oauth_pkce_states
ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Add foreign key constraint to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'oauth_pkce_states_user_id_users_id_fk'
  ) THEN
    ALTER TABLE oauth_pkce_states
      ADD CONSTRAINT oauth_pkce_states_user_id_users_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create index for efficient user-based lookups
CREATE INDEX IF NOT EXISTS idx_oauth_pkce_states_user_id
  ON oauth_pkce_states(user_id);

-- Create composite index for the common query pattern (state + user_id)
CREATE INDEX IF NOT EXISTS idx_oauth_pkce_states_state_user
  ON oauth_pkce_states(state, user_id);

-- After this migration, application code MUST set user_id for new PKCE states
-- Old states without user_id will expire naturally (10 min TTL)
