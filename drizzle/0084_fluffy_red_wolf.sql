ALTER TABLE "cluster_alerts" ADD CONSTRAINT "cluster_alerts_agent_uuid_agents_uuid_fk" FOREIGN KEY ("agent_uuid") REFERENCES "public"."agents"("uuid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_heartbeats_agent_timestamp_idx" ON "agent_heartbeats" USING btree ("agent_uuid","timestamp");--> statement-breakpoint
CREATE INDEX "agent_lifecycle_events_agent_timestamp_idx" ON "agent_lifecycle_events" USING btree ("agent_uuid","timestamp");--> statement-breakpoint
CREATE INDEX "agent_metrics_agent_timestamp_idx" ON "agent_metrics" USING btree ("agent_uuid","timestamp");--> statement-breakpoint
CREATE INDEX "agents_last_heartbeat_at_idx" ON "agents" USING btree ("last_heartbeat_at");--> statement-breakpoint
CREATE INDEX "cluster_alerts_cluster_ack_created_idx" ON "cluster_alerts" USING btree ("cluster_uuid","acknowledged","created_at");