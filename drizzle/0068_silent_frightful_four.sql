DROP INDEX "idx_mcp_servers_registry_data_gin";--> statement-breakpoint
CREATE INDEX "idx_mcp_servers_registry_data_gin" ON "mcp_servers" USING gin ("registry_data");