-- Migration: 0083_sourcery_improvements
-- Purpose: Address Sourcery code review feedback on PAP schema
-- Issues addressed:
--   1. FK constraint on cluster_alerts.agent_uuid (ON DELETE SET NULL)
--   2. updated_at triggers for agent_templates and clusters
--   3. Composite indexes for telemetry tables
--   4. Index on agents.last_heartbeat_at for zombie detection
--   5. DNS name validation constraint
--   6. Composite index for cluster_alerts queries

-- ============================================================================
-- 1. FK CONSTRAINT: cluster_alerts.agent_uuid
-- ============================================================================
-- Add FK with SET NULL to maintain referential integrity while preserving
-- alert history after agent deletion (as noted in schema comment)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'cluster_alerts_agent_uuid_agents_uuid_fk'
    ) THEN
        ALTER TABLE "cluster_alerts"
        ADD CONSTRAINT "cluster_alerts_agent_uuid_agents_uuid_fk"
        FOREIGN KEY ("agent_uuid") REFERENCES "public"."agents"("uuid")
        ON DELETE SET NULL ON UPDATE NO ACTION;
    END IF;
END$$;
--> statement-breakpoint

-- ============================================================================
-- 2. UPDATED_AT TRIGGERS
-- ============================================================================
-- Create reusable trigger function for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Add trigger to agent_templates
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'agent_templates_updated_at_trigger'
    ) THEN
        CREATE TRIGGER agent_templates_updated_at_trigger
            BEFORE UPDATE ON "agent_templates"
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END$$;
--> statement-breakpoint

-- Add trigger to clusters
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'clusters_updated_at_trigger'
    ) THEN
        CREATE TRIGGER clusters_updated_at_trigger
            BEFORE UPDATE ON "clusters"
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END$$;
--> statement-breakpoint

-- ============================================================================
-- 3. COMPOSITE INDEXES FOR TELEMETRY TABLES
-- ============================================================================
-- Typical queries filter by agent AND time range, so composite indexes help

-- agent_heartbeats: queries like "get heartbeats for agent X in last Y minutes"
CREATE INDEX IF NOT EXISTS "agent_heartbeats_agent_timestamp_idx"
ON "agent_heartbeats" USING btree ("agent_uuid", "timestamp" DESC);
--> statement-breakpoint

-- agent_metrics: queries like "get metrics for agent X in last Y minutes"
CREATE INDEX IF NOT EXISTS "agent_metrics_agent_timestamp_idx"
ON "agent_metrics" USING btree ("agent_uuid", "timestamp" DESC);
--> statement-breakpoint

-- agent_lifecycle_events: queries like "get events for agent X ordered by time"
CREATE INDEX IF NOT EXISTS "agent_lifecycle_events_agent_timestamp_idx"
ON "agent_lifecycle_events" USING btree ("agent_uuid", "timestamp" DESC);
--> statement-breakpoint

-- cluster_alerts: queries like "get unacknowledged alerts for cluster X"
CREATE INDEX IF NOT EXISTS "cluster_alerts_cluster_ack_created_idx"
ON "cluster_alerts" USING btree ("cluster_uuid", "acknowledged", "created_at" DESC);
--> statement-breakpoint

-- ============================================================================
-- 4. INDEX ON LAST_HEARTBEAT_AT FOR ZOMBIE DETECTION
-- ============================================================================
-- Zombie detection queries: "find agents where last_heartbeat_at < threshold"
CREATE INDEX IF NOT EXISTS "agents_last_heartbeat_at_idx"
ON "agents" USING btree ("last_heartbeat_at");
--> statement-breakpoint

-- ============================================================================
-- 5. DNS NAME VALIDATION CONSTRAINT
-- ============================================================================
-- DNS labels must be lowercase alphanumeric or hyphens, max 63 chars
-- Pattern: starts with letter, ends with alphanumeric, no consecutive hyphens
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'agents_dns_name_valid'
    ) THEN
        ALTER TABLE "agents"
        ADD CONSTRAINT "agents_dns_name_valid"
        CHECK (dns_name ~ '^[a-z][a-z0-9-]*[a-z0-9]$' AND LENGTH(dns_name) <= 63);
    END IF;
END$$;
--> statement-breakpoint

-- ============================================================================
-- 6. DATA RETENTION STRATEGY (DOCUMENTATION)
-- ============================================================================
-- NOTE: High-volume telemetry tables should implement retention policies:
--
-- Recommended retention periods (configurable):
--   - agent_heartbeats: 7 days (liveness data, high volume)
--   - agent_metrics: 30 days (resource telemetry)
--   - agent_lifecycle_events: 90 days (audit trail)
--   - cluster_alerts: 180 days (operational history)
--
-- Implementation options:
--   1. Scheduled cleanup jobs (pg_cron or application-level)
--   2. Table partitioning by month (for very high volume)
--   3. TimescaleDB hypertables (if using TimescaleDB extension)
--
-- Example cleanup query (to be run via cron):
--   DELETE FROM agent_heartbeats WHERE timestamp < NOW() - INTERVAL '7 days';
--   DELETE FROM agent_metrics WHERE timestamp < NOW() - INTERVAL '30 days';
--
-- This comment serves as documentation for operators to implement
-- retention based on their specific requirements and scale.

-- ============================================================================
-- 7. UNIQUE DEFAULT MODEL CONSTRAINT
-- ============================================================================
-- Ensure only one model can be marked as default per agent.
-- This uses a partial unique index (PostgreSQL feature) that only applies
-- when is_default = true.
CREATE UNIQUE INDEX IF NOT EXISTS "agent_models_one_default_per_agent"
ON "agent_models" ("agent_uuid")
WHERE "is_default" = true;
--> statement-breakpoint

-- ============================================================================
-- 8. TIMEZONE CONVENTION DOCUMENTATION
-- ============================================================================
-- CONVENTION: All timestamps in this schema use `WITH TIME ZONE` (timestamptz)
--
-- This ensures:
--   1. Storage: All timestamps stored as UTC internally
--   2. Display: PostgreSQL converts to client's timezone on retrieval
--   3. Comparison: Accurate cross-timezone comparisons
--   4. DST Safety: No ambiguity during daylight saving transitions
--
-- Application code should:
--   - Always use timezone-aware datetime objects
--   - Store timestamps in UTC or let the database handle conversion
--   - Use ISO 8601 format for API responses (e.g., "2024-01-15T10:30:00Z")
--
-- Tables using timestamptz:
--   - agents: created_at, provisioned_at, activated_at, terminated_at, last_heartbeat_at
--   - agent_heartbeats: timestamp
--   - agent_metrics: timestamp
--   - agent_lifecycle_events: timestamp
--   - agent_templates: created_at, updated_at
--   - agent_models: created_at
--   - clusters: last_alert_at, last_seen_at, created_at, updated_at
--   - cluster_alerts: acknowledged_at, alert_timestamp, created_at
