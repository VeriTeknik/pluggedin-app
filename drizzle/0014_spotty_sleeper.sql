-- CREATE TYPE "public"."mcp_server_source" AS ENUM('PLUGGEDIN', 'SMITHERY', 'NPM', 'GITHUB');--> statement-breakpoint -- Type already exists, removed to prevent migration error
CREATE TABLE IF NOT EXISTS "search_cache" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "mcp_server_source" NOT NULL,
	"query" text NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'mcp_servers' AND column_name = 'source') THEN
        ALTER TABLE "mcp_servers" ADD COLUMN "source" "mcp_server_source" DEFAULT 'PLUGGEDIN' NOT NULL;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'mcp_servers' AND column_name = 'external_id') THEN
        ALTER TABLE "mcp_servers" ADD COLUMN "external_id" text;
    END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_cache_source_query_idx" ON "search_cache" USING btree ("source","query");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_cache_expires_at_idx" ON "search_cache" USING btree ("expires_at");
