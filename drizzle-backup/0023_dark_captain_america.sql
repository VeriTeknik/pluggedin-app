CREATE TABLE "prompts" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mcp_server_uuid" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"arguments_schema" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompts_unique_prompt_name_per_server_idx" UNIQUE("mcp_server_uuid","name")
);
--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_mcp_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("mcp_server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompts_mcp_server_uuid_idx" ON "prompts" USING btree ("mcp_server_uuid");