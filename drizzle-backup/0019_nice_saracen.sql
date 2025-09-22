CREATE TABLE IF NOT EXISTS "resource_templates" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mcp_server_uuid" uuid NOT NULL,
	"uri_template" text NOT NULL,
	"name" text,
	"description" text,
	"mime_type" text,
	"template_variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'mcp_servers' AND column_name = 'notes') THEN
        ALTER TABLE "mcp_servers" ADD COLUMN "notes" text;
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND table_name = 'resource_templates' AND constraint_name = 'resource_templates_mcp_server_uuid_mcp_servers_uuid_fk') THEN
        ALTER TABLE "resource_templates" ADD CONSTRAINT "resource_templates_mcp_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("mcp_server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resource_templates_mcp_server_uuid_idx" ON "resource_templates" USING btree ("mcp_server_uuid");
