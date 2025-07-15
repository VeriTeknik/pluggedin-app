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
CREATE TABLE IF NOT EXISTS "mcp_sessions" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"server_uuid" uuid NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"session_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_activity" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transport_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_uuid" uuid NOT NULL,
	"transport_type" varchar(50) NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE IF EXISTS "user_ratings" CASCADE;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "mcp_sessions" ADD CONSTRAINT "mcp_sessions_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "mcp_sessions" ADD CONSTRAINT "mcp_sessions_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "transport_configs" ADD CONSTRAINT "transport_configs_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_server_activity" ON "mcp_activity" USING btree ("server_uuid","source","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_external_activity" ON "mcp_activity" USING btree ("external_id","source","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_action_time" ON "mcp_activity" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mcp_sessions_server_uuid" ON "mcp_sessions" USING btree ("server_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mcp_sessions_expires_at" ON "mcp_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mcp_sessions_profile_uuid" ON "mcp_sessions" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transport_configs_server_uuid" ON "transport_configs" USING btree ("server_uuid");