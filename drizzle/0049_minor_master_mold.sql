ALTER TABLE "mcp_servers" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "idx_mcp_servers_slug" UNIQUE("slug");