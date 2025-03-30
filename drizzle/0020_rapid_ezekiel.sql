-- CREATE TYPE "public"."profile_capability" AS ENUM('TOOLS_MANAGEMENT');--> statement-breakpoint -- Type already exists, removed to prevent migration error
-- CREATE TYPE "public"."toggle_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint -- Type likely already exists, removed to prevent migration error
CREATE TABLE IF NOT EXISTS "tools" (
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
DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'enabled_capabilities') THEN
        ALTER TABLE "profiles" ADD COLUMN "enabled_capabilities" "profile_capability"[] DEFAULT '{}'::profile_capability[] NOT NULL;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND table_name = 'tools' AND constraint_name = 'tools_mcp_server_uuid_mcp_servers_uuid_fk') THEN
        ALTER TABLE "tools" ADD CONSTRAINT "tools_mcp_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("mcp_server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tools_mcp_server_uuid_idx" ON "tools" USING btree ("mcp_server_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tools_status_idx" ON "tools" USING btree ("status");
