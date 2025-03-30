CREATE TYPE "public"."profile_capability" AS ENUM('TOOLS_MANAGEMENT');--> statement-breakpoint
CREATE TYPE "public"."toggle_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TABLE "tools" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"tool_schema" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mcp_server_uuid" uuid NOT NULL,
	"status" "toggle_status" DEFAULT 'ACTIVE' NOT NULL,
	CONSTRAINT "tools_unique_tool_name_per_server_idx" UNIQUE("mcp_server_uuid","name")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "enabled_capabilities" "profile_capability"[] DEFAULT '{}'::profile_capability[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_mcp_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("mcp_server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tools_mcp_server_uuid_idx" ON "tools" USING btree ("mcp_server_uuid");--> statement-breakpoint
CREATE INDEX "tools_status_idx" ON "tools" USING btree ("status");