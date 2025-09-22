CREATE TABLE IF NOT EXISTS "mcp_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"server_uuid" uuid,
	"external_id" text,
	"source" text NOT NULL,
	"action" text NOT NULL,
	"item_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_server_activity" ON "mcp_activity" ("server_uuid","source","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_external_activity" ON "mcp_activity" ("external_id","source","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_action_time" ON "mcp_activity" ("action","created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mcp_activity" ADD CONSTRAINT "mcp_activity_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "profiles"("uuid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mcp_activity" ADD CONSTRAINT "mcp_activity_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("server_uuid") REFERENCES "mcp_servers"("uuid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;