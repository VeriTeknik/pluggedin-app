ALTER TABLE "mcp_servers" ADD COLUMN "command_encrypted" text;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN "args_encrypted" text;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN "env_encrypted" text;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN "url_encrypted" text;--> statement-breakpoint
ALTER TABLE "shared_mcp_servers" ADD COLUMN "requires_credentials" boolean DEFAULT false NOT NULL;