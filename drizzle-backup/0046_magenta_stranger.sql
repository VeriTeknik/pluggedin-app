CREATE INDEX "idx_mcp_servers_profile_status" ON "mcp_servers" USING btree ("profile_uuid","status");--> statement-breakpoint
CREATE INDEX "idx_notifications_profile_read_created" ON "notifications" USING btree ("profile_uuid","read","created_at");--> statement-breakpoint
CREATE INDEX "idx_server_installations_profile_server" ON "server_installations" USING btree ("profile_uuid","server_uuid");--> statement-breakpoint
CREATE INDEX "idx_shared_mcp_servers_public_profile" ON "shared_mcp_servers" USING btree ("is_public","profile_uuid");--> statement-breakpoint
CREATE INDEX "idx_shared_mcp_servers_public_created" ON "shared_mcp_servers" USING btree ("is_public","created_at");