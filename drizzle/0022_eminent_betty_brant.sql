CREATE TABLE "resources" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mcp_server_uuid" uuid NOT NULL,
	"uri" text NOT NULL,
	"name" text,
	"description" text,
	"mime_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "toggle_status" DEFAULT 'ACTIVE' NOT NULL,
	CONSTRAINT "resources_unique_uri_per_server_idx" UNIQUE("mcp_server_uuid","uri")
);
--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_mcp_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("mcp_server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resources_mcp_server_uuid_idx" ON "resources" USING btree ("mcp_server_uuid");--> statement-breakpoint
CREATE INDEX "resources_status_idx" ON "resources" USING btree ("status");