CREATE TYPE "public"."agent_state" AS ENUM('NEW', 'PROVISIONED', 'ACTIVE', 'DRAINING', 'TERMINATED', 'KILLED');--> statement-breakpoint
CREATE TYPE "public"."heartbeat_mode" AS ENUM('EMERGENCY', 'IDLE', 'SLEEP');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_heartbeats" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_uuid" uuid NOT NULL,
	"mode" "heartbeat_mode" DEFAULT 'IDLE' NOT NULL,
	"uptime_seconds" integer NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_lifecycle_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_uuid" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_state" "agent_state",
	"to_state" "agent_state",
	"metadata" jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_metrics" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_uuid" uuid NOT NULL,
	"cpu_percent" integer,
	"memory_mb" integer,
	"requests_handled" integer,
	"custom_metrics" jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_models" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_uuid" uuid NOT NULL,
	"model_name" text NOT NULL,
	"model_provider" text NOT NULL,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_models_agent_model_unique" UNIQUE("agent_uuid","model_name","model_provider")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agents" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"dns_name" text NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"state" "agent_state" DEFAULT 'NEW' NOT NULL,
	"kubernetes_namespace" text DEFAULT 'agents',
	"kubernetes_deployment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provisioned_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"terminated_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone,
	"metadata" jsonb,
	CONSTRAINT "agents_name_unique" UNIQUE("name"),
	CONSTRAINT "agents_dns_name_unique" UNIQUE("dns_name")
);
--> statement-breakpoint
ALTER TABLE "agent_heartbeats" ADD CONSTRAINT "agent_heartbeats_agent_uuid_agents_uuid_fk" FOREIGN KEY ("agent_uuid") REFERENCES "public"."agents"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_lifecycle_events" ADD CONSTRAINT "agent_lifecycle_events_agent_uuid_agents_uuid_fk" FOREIGN KEY ("agent_uuid") REFERENCES "public"."agents"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_metrics" ADD CONSTRAINT "agent_metrics_agent_uuid_agents_uuid_fk" FOREIGN KEY ("agent_uuid") REFERENCES "public"."agents"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_models" ADD CONSTRAINT "agent_models_agent_uuid_agents_uuid_fk" FOREIGN KEY ("agent_uuid") REFERENCES "public"."agents"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_heartbeats_agent_uuid_idx" ON "agent_heartbeats" USING btree ("agent_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_heartbeats_timestamp_idx" ON "agent_heartbeats" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_lifecycle_events_agent_uuid_idx" ON "agent_lifecycle_events" USING btree ("agent_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_lifecycle_events_timestamp_idx" ON "agent_lifecycle_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_lifecycle_events_event_type_idx" ON "agent_lifecycle_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_metrics_agent_uuid_idx" ON "agent_metrics" USING btree ("agent_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_metrics_timestamp_idx" ON "agent_metrics" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_models_agent_uuid_idx" ON "agent_models" USING btree ("agent_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_profile_uuid_idx" ON "agents" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_state_idx" ON "agents" USING btree ("state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_dns_name_idx" ON "agents" USING btree ("dns_name");