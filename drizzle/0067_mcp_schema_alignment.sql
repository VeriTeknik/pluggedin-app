-- MCP Schema Alignment Migration
-- Purpose: Complete registry data preservation, OAuth support, and data integrity tracing
-- Phase: Phase 1 - Foundation
-- Date: 2025-01-08

-- ============================================================================
-- 1. Extend mcp_servers table with registry preservation fields
-- ============================================================================

-- Complete registry data (no transformation)
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS registry_data JSONB;
CREATE INDEX IF NOT EXISTS idx_mcp_servers_registry_data_gin ON mcp_servers USING GIN(registry_data);

-- Version tracking
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS registry_version TEXT;
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS registry_release_date TIMESTAMPTZ;
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS registry_status TEXT;

-- Repository information
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS repository_url TEXT;
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS repository_source TEXT;
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS repository_id TEXT;

-- Installation metadata (for package isolation)
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS install_path TEXT;
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS install_status TEXT;
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS installed_at TIMESTAMPTZ;

-- Encryption salt for this server's sensitive data
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS encryption_salt TEXT;

-- ============================================================================
-- 2. Remote headers table (OAuth configuration from registry)
-- ============================================================================

CREATE TABLE IF NOT EXISTS mcp_server_remote_headers (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_uuid UUID NOT NULL REFERENCES mcp_servers(uuid) ON DELETE CASCADE,
  header_name TEXT NOT NULL,
  header_value_encrypted TEXT,  -- AES-256-GCM encrypted (if is_secret=true)
  description TEXT,
  is_required BOOLEAN DEFAULT false,
  is_secret BOOLEAN DEFAULT false,
  default_value TEXT,  -- Only for non-secret headers
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remote_headers_server_uuid ON mcp_server_remote_headers(server_uuid);
CREATE INDEX IF NOT EXISTS idx_remote_headers_name ON mcp_server_remote_headers(server_uuid, header_name);

-- ============================================================================
-- 3. OAuth configuration table (discovered or manual)
-- ============================================================================

CREATE TABLE IF NOT EXISTS mcp_server_oauth_config (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_uuid UUID NOT NULL REFERENCES mcp_servers(uuid) ON DELETE CASCADE,
  authorization_endpoint TEXT NOT NULL,
  token_endpoint TEXT NOT NULL,
  registration_endpoint TEXT,  -- For Dynamic Client Registration (RFC7591)
  authorization_server TEXT NOT NULL,
  resource_identifier TEXT,  -- RFC8707 resource parameter
  client_id TEXT,
  client_secret_encrypted TEXT,  -- AES-256-GCM encrypted
  scopes TEXT[],
  supports_pkce BOOLEAN DEFAULT true,
  discovery_method TEXT,  -- 'rfc9728', 'www-authenticate', 'manual'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(server_uuid)  -- One OAuth config per server
);

CREATE INDEX IF NOT EXISTS idx_oauth_config_server_uuid ON mcp_server_oauth_config(server_uuid);

-- ============================================================================
-- 4. OAuth tokens table (encrypted storage)
-- ============================================================================

CREATE TABLE IF NOT EXISTS mcp_server_oauth_tokens (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_uuid UUID NOT NULL REFERENCES mcp_servers(uuid) ON DELETE CASCADE,
  access_token_encrypted TEXT NOT NULL,  -- AES-256-GCM encrypted
  refresh_token_encrypted TEXT,          -- AES-256-GCM encrypted
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ,
  scopes TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_server_uuid ON mcp_server_oauth_tokens(server_uuid);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires_at ON mcp_server_oauth_tokens(expires_at);

-- ============================================================================
-- 5. MCP Telemetry table (privacy-preserving observability)
-- ============================================================================

CREATE TABLE IF NOT EXISTS mcp_telemetry (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  event_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_event_name ON mcp_telemetry(event_name);
CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON mcp_telemetry(created_at);

-- Automatic cleanup for telemetry (run via cron or pg_cron)
-- Delete successes after 7 days
-- DELETE FROM mcp_telemetry WHERE created_at < NOW() - INTERVAL '7 days' AND NOT (event_data->>'error' IS NOT NULL);
-- Delete failures after 30 days
-- DELETE FROM mcp_telemetry WHERE created_at < NOW() - INTERVAL '30 days' AND event_data->>'error' IS NOT NULL;

-- ============================================================================
-- 6. Data Integrity Traces (DEVELOPMENT ONLY)
-- ============================================================================

CREATE TABLE IF NOT EXISTS data_integrity_traces (
  id BIGSERIAL PRIMARY KEY,
  trace_id UUID NOT NULL,
  hop TEXT NOT NULL,  -- 'registry', 'registry-proxy', 'app-receive', 'app-transform', 'app-persist', 'database', 'integrity_report'
  server_name TEXT,
  server_uuid UUID,
  event_data JSONB NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_integrity_traces_trace_id ON data_integrity_traces(trace_id);
CREATE INDEX IF NOT EXISTS idx_data_integrity_traces_hop ON data_integrity_traces(hop);
CREATE INDEX IF NOT EXISTS idx_data_integrity_traces_timestamp ON data_integrity_traces(timestamp);
CREATE INDEX IF NOT EXISTS idx_data_integrity_traces_server_uuid ON data_integrity_traces(server_uuid);

-- ============================================================================
-- 7. Data Integrity Errors (DEVELOPMENT ONLY)
-- ============================================================================

CREATE TABLE IF NOT EXISTS data_integrity_errors (
  id BIGSERIAL PRIMARY KEY,
  error_type TEXT NOT NULL,  -- 'DATA_LOSS_DETECTED', 'HEADERS_DROPPED_IN_TRANSFORM', 'NO_HEADERS_PERSISTED', 'DATA_LOSS_END_TO_END'
  trace_id UUID NOT NULL,
  server_name TEXT,
  server_uuid UUID,
  error_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_integrity_errors_error_type ON data_integrity_errors(error_type);
CREATE INDEX IF NOT EXISTS idx_data_integrity_errors_trace_id ON data_integrity_errors(trace_id);
CREATE INDEX IF NOT EXISTS idx_data_integrity_errors_created_at ON data_integrity_errors(created_at);

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Verify tables exist
DO $$
BEGIN
    ASSERT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'mcp_servers' AND column_name = 'registry_data'),
        'mcp_servers.registry_data column not created';
    ASSERT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'mcp_server_remote_headers'),
        'mcp_server_remote_headers table not created';
    ASSERT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'mcp_server_oauth_config'),
        'mcp_server_oauth_config table not created';
    ASSERT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'mcp_server_oauth_tokens'),
        'mcp_server_oauth_tokens table not created';
    ASSERT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'mcp_telemetry'),
        'mcp_telemetry table not created';
    ASSERT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'data_integrity_traces'),
        'data_integrity_traces table not created';
    ASSERT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'data_integrity_errors'),
        'data_integrity_errors table not created';

    RAISE NOTICE 'MCP Schema Alignment Migration completed successfully';
END $$;
