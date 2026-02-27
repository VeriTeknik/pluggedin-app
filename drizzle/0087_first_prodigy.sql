ALTER TABLE "agent_templates" ADD COLUMN "configurable" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "config_values" jsonb DEFAULT '{}'::jsonb;