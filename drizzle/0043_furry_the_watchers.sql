CREATE TABLE "mcp_oauth_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"server_uuid" uuid NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"callback_url" text NOT NULL,
	"provider" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mcp_oauth_sessions_state_unique" UNIQUE("state")
);
--> statement-breakpoint
CREATE INDEX "idx_mcp_oauth_sessions_state" ON "mcp_oauth_sessions" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_mcp_oauth_sessions_expires_at" ON "mcp_oauth_sessions" USING btree ("expires_at");