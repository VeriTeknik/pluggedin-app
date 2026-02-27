CREATE TYPE "public"."access_level" AS ENUM('PRIVATE', 'PUBLIC');--> statement-breakpoint
CREATE TYPE "public"."agent_state" AS ENUM('NEW', 'PROVISIONED', 'ACTIVE', 'DRAINING', 'TERMINATED', 'KILLED');--> statement-breakpoint
-- Note: alert_severity uses lowercase values to match standard monitoring conventions (Prometheus, Grafana, etc.)
CREATE TYPE "public"."alert_severity" AS ENUM('critical', 'warning', 'info');--> statement-breakpoint
CREATE TYPE "public"."cluster_alert_type" AS ENUM('AGENT_DEATH', 'EMERGENCY_MODE', 'RESTART_DETECTED');--> statement-breakpoint
CREATE TYPE "public"."cluster_status" AS ENUM('ACTIVE', 'INACTIVE', 'MAINTENANCE');--> statement-breakpoint
CREATE TYPE "public"."deployment_status" AS ENUM('PENDING', 'DEPLOYING', 'RUNNING', 'FAILED', 'STOPPED');--> statement-breakpoint
CREATE TYPE "public"."heartbeat_mode" AS ENUM('EMERGENCY', 'IDLE', 'SLEEP');--> statement-breakpoint
CREATE TABLE "agent_heartbeats" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_uuid" uuid NOT NULL,
	"mode" "heartbeat_mode" DEFAULT 'IDLE' NOT NULL,
	"uptime_seconds" integer NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_lifecycle_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_uuid" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_state" "agent_state",
	"to_state" "agent_state",
	"metadata" jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_metrics" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_uuid" uuid NOT NULL,
	"cpu_percent" integer,
	"memory_mb" integer,
	"requests_handled" integer,
	"custom_metrics" jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_models" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_uuid" uuid NOT NULL,
	"model_name" text NOT NULL,
	"model_provider" text NOT NULL,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_models_agent_model_unique" UNIQUE("agent_uuid","model_name","model_provider")
);
--> statement-breakpoint
CREATE TABLE "agent_templates" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"namespace" text NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"long_description" text,
	"icon_url" text,
	"banner_url" text,
	"docker_image" text NOT NULL,
	"container_port" integer DEFAULT 3000,
	"health_endpoint" text DEFAULT '/health',
	"env_schema" jsonb,
	"tags" text[],
	"category" text,
	"is_public" boolean DEFAULT false,
	"is_verified" boolean DEFAULT false,
	"is_featured" boolean DEFAULT false,
	"publisher_id" text,
	"repository_url" text,
	"documentation_url" text,
	"install_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_templates_namespace_name_version_unique" UNIQUE("namespace","name","version")
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"dns_name" text NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"template_uuid" uuid,
	"access_level" "access_level" DEFAULT 'PRIVATE' NOT NULL,
	"state" "agent_state" DEFAULT 'NEW' NOT NULL,
	"heartbeat_mode" "heartbeat_mode" DEFAULT 'IDLE' NOT NULL,
	"deployment_status" "deployment_status" DEFAULT 'PENDING' NOT NULL,
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
CREATE TABLE "cluster_alerts" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_uuid" uuid,
	"alert_type" "cluster_alert_type" NOT NULL,
	"agent_uuid" uuid,
	"agent_name" text,
	"severity" "alert_severity" NOT NULL,
	"details" jsonb,
	"acknowledged" boolean DEFAULT false,
	"acknowledged_by" text,
	"acknowledged_at" timestamp with time zone,
	"alert_timestamp" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clusters" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"collector_url" text,
	"status" "cluster_status" DEFAULT 'ACTIVE',
	"last_alert_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"agent_count" integer DEFAULT 0,
	"healthy_agent_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clusters_cluster_id_unique" UNIQUE("cluster_id")
);
--> statement-breakpoint
ALTER TABLE "agent_heartbeats" ADD CONSTRAINT "agent_heartbeats_agent_uuid_agents_uuid_fk" FOREIGN KEY ("agent_uuid") REFERENCES "public"."agents"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_lifecycle_events" ADD CONSTRAINT "agent_lifecycle_events_agent_uuid_agents_uuid_fk" FOREIGN KEY ("agent_uuid") REFERENCES "public"."agents"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_metrics" ADD CONSTRAINT "agent_metrics_agent_uuid_agents_uuid_fk" FOREIGN KEY ("agent_uuid") REFERENCES "public"."agents"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_models" ADD CONSTRAINT "agent_models_agent_uuid_agents_uuid_fk" FOREIGN KEY ("agent_uuid") REFERENCES "public"."agents"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_template_uuid_agent_templates_uuid_fk" FOREIGN KEY ("template_uuid") REFERENCES "public"."agent_templates"("uuid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_alerts" ADD CONSTRAINT "cluster_alerts_cluster_uuid_clusters_uuid_fk" FOREIGN KEY ("cluster_uuid") REFERENCES "public"."clusters"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_heartbeats_agent_uuid_idx" ON "agent_heartbeats" USING btree ("agent_uuid");--> statement-breakpoint
CREATE INDEX "agent_heartbeats_timestamp_idx" ON "agent_heartbeats" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "agent_lifecycle_events_agent_uuid_idx" ON "agent_lifecycle_events" USING btree ("agent_uuid");--> statement-breakpoint
CREATE INDEX "agent_lifecycle_events_timestamp_idx" ON "agent_lifecycle_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "agent_lifecycle_events_event_type_idx" ON "agent_lifecycle_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "agent_metrics_agent_uuid_idx" ON "agent_metrics" USING btree ("agent_uuid");--> statement-breakpoint
CREATE INDEX "agent_metrics_timestamp_idx" ON "agent_metrics" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "agent_models_agent_uuid_idx" ON "agent_models" USING btree ("agent_uuid");--> statement-breakpoint
CREATE INDEX "agent_templates_namespace_idx" ON "agent_templates" USING btree ("namespace");--> statement-breakpoint
CREATE INDEX "agent_templates_category_idx" ON "agent_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "agent_templates_is_public_idx" ON "agent_templates" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "agents_profile_uuid_idx" ON "agents" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "agents_template_uuid_idx" ON "agents" USING btree ("template_uuid");--> statement-breakpoint
CREATE INDEX "agents_state_idx" ON "agents" USING btree ("state");--> statement-breakpoint
CREATE INDEX "agents_dns_name_idx" ON "agents" USING btree ("dns_name");--> statement-breakpoint
CREATE INDEX "agents_access_level_idx" ON "agents" USING btree ("access_level");--> statement-breakpoint
CREATE INDEX "agents_deployment_status_idx" ON "agents" USING btree ("deployment_status");--> statement-breakpoint
CREATE INDEX "cluster_alerts_cluster_uuid_idx" ON "cluster_alerts" USING btree ("cluster_uuid");--> statement-breakpoint
CREATE INDEX "cluster_alerts_alert_type_idx" ON "cluster_alerts" USING btree ("alert_type");--> statement-breakpoint
CREATE INDEX "cluster_alerts_agent_uuid_idx" ON "cluster_alerts" USING btree ("agent_uuid");--> statement-breakpoint
CREATE INDEX "cluster_alerts_acknowledged_idx" ON "cluster_alerts" USING btree ("acknowledged");--> statement-breakpoint
CREATE INDEX "cluster_alerts_created_at_idx" ON "cluster_alerts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "clusters_cluster_id_idx" ON "clusters" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "clusters_status_idx" ON "clusters" USING btree ("status");