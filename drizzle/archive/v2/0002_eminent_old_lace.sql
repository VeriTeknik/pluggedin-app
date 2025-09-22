CREATE TABLE IF NOT EXISTS "codes" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_mcp_servers" ADD COLUMN "code_uuid" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_mcp_servers" ADD CONSTRAINT "custom_mcp_servers_code_uuid_codes_uuid_fk" FOREIGN KEY ("code_uuid") REFERENCES "public"."codes"("uuid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_mcp_servers" DROP COLUMN "code";
