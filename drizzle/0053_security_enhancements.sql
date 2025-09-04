-- Security Enhancements Migration
-- This migration adds security improvements to the database schema

-- 1. Add constraints and columns to password_reset_tokens
ALTER TABLE password_reset_tokens 
  ADD CONSTRAINT pk_password_reset_tokens PRIMARY KEY (identifier, token);

ALTER TABLE password_reset_tokens
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS ip_address INET,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0;

-- 2. Add security indexes
CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires);
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email, email_verified);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);

-- 3. Create audit_logs table for security events
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id TEXT,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Add index for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action ON audit_logs(user_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- 5. Add encryption version tracking to sensitive tables
ALTER TABLE mcp_servers 
  ADD COLUMN IF NOT EXISTS encryption_version INTEGER DEFAULT 1;

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS encryption_version INTEGER DEFAULT 1;

-- 6. Add security columns to users table for enhanced authentication
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS account_locked_until TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_login_ip INET,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mfa_secret TEXT;

-- 7. Create table for API key management
CREATE TABLE IF NOT EXISTS api_key_usage (
  id SERIAL PRIMARY KEY,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint VARCHAR(255),
  method VARCHAR(10),
  ip_address INET,
  user_agent TEXT,
  response_status INTEGER,
  response_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 8. Add index for API key usage queries
CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_created ON api_key_usage(api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_key_usage_created_at ON api_key_usage(created_at DESC);

-- 9. Add expiration and rotation tracking to API keys
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_rotated_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0;

-- 10. Create index for API key expiration checks
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at) WHERE expires_at IS NOT NULL;

-- Comments for documentation
COMMENT ON TABLE audit_logs IS 'Audit trail for security-sensitive operations';
COMMENT ON COLUMN audit_logs.user_id IS 'User who performed the action (NULL for system actions)';
COMMENT ON COLUMN audit_logs.action IS 'Type of action performed (e.g., LOGIN, LOGOUT, PASSWORD_CHANGE, etc.)';
COMMENT ON COLUMN audit_logs.metadata IS 'Additional context about the action in JSON format';

COMMENT ON COLUMN users.failed_login_attempts IS 'Number of consecutive failed login attempts';
COMMENT ON COLUMN users.account_locked_until IS 'Timestamp until which the account is locked due to failed attempts';
COMMENT ON COLUMN users.mfa_secret IS 'Encrypted TOTP secret for multi-factor authentication';

COMMENT ON COLUMN api_keys.encryption_version IS 'Version of encryption used (1=legacy, 2=secure)';
COMMENT ON COLUMN mcp_servers.encryption_version IS 'Version of encryption used (1=legacy, 2=secure)';