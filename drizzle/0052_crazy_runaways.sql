ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "transport_encrypted" text;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "streamable_http_options_encrypted" text;