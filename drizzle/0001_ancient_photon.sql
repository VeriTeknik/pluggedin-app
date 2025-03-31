CREATE TABLE IF NOT EXISTS "custom_mcp_servers" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"code" text NOT NULL,
	"additional_args" text[] DEFAULT '{}'::text[] NOT NULL,
	"env" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"status" "mcp_server_status" DEFAULT 'ACTIVE' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_mcp_servers" ADD CONSTRAINT "custom_mcp_servers_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_mcp_servers_status_idx" ON "custom_mcp_servers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "custom_mcp_servers_profile_uuid_idx" ON "custom_mcp_servers" USING btree ("profile_uuid");
