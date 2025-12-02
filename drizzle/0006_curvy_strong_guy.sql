CREATE TYPE "public"."mcp_server_type" AS ENUM('STDIO', 'SSE');--> statement-breakpoint
ALTER TABLE "mcp_servers" ALTER COLUMN "command" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "type" "mcp_server_type" DEFAULT 'STDIO' NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "url" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_servers_type_idx" ON "mcp_servers" USING btree ("type");