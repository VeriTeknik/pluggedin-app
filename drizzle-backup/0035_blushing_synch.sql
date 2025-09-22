ALTER TABLE "mcp_servers" ALTER COLUMN "args" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "mcp_servers" ALTER COLUMN "args" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_servers" ALTER COLUMN "env" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "mcp_servers" ALTER COLUMN "env" DROP NOT NULL;