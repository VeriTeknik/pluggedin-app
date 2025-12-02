ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "command_encrypted" text;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "args_encrypted" text;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "env_encrypted" text;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "url_encrypted" text;--> statement-breakpoint
ALTER TABLE "shared_mcp_servers" ADD COLUMN IF NOT EXISTS "requires_credentials" boolean DEFAULT false NOT NULL;