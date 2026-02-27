-- Migration: 0084_fluffy_red_wolf
-- Made idempotent to handle re-runs and conflicts with 0083

-- Add FK constraint idempotently (may already exist from 0083)
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

-- Create indexes idempotently (may already exist from 0083)
CREATE INDEX IF NOT EXISTS "agent_heartbeats_agent_timestamp_idx" ON "agent_heartbeats" USING btree ("agent_uuid","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_lifecycle_events_agent_timestamp_idx" ON "agent_lifecycle_events" USING btree ("agent_uuid","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_metrics_agent_timestamp_idx" ON "agent_metrics" USING btree ("agent_uuid","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_last_heartbeat_at_idx" ON "agents" USING btree ("last_heartbeat_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cluster_alerts_cluster_ack_created_idx" ON "cluster_alerts" USING btree ("cluster_uuid","acknowledged","created_at");