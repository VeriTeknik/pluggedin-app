ALTER TABLE "shared_mcp_servers" ADD COLUMN "is_claimed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shared_mcp_servers" ADD COLUMN "claimed_by_user_id" text;--> statement-breakpoint
ALTER TABLE "shared_mcp_servers" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shared_mcp_servers" ADD COLUMN "registry_server_uuid" uuid;--> statement-breakpoint
ALTER TABLE "shared_mcp_servers" ADD CONSTRAINT "shared_mcp_servers_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mcp_servers" ADD CONSTRAINT "shared_mcp_servers_registry_server_uuid_registry_servers_uuid_fk" FOREIGN KEY ("registry_server_uuid") REFERENCES "public"."registry_servers"("uuid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shared_mcp_servers_is_claimed_idx" ON "shared_mcp_servers" USING btree ("is_claimed");--> statement-breakpoint
CREATE INDEX "shared_mcp_servers_claimed_by_idx" ON "shared_mcp_servers" USING btree ("claimed_by_user_id");