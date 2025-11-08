CREATE TABLE "oauth_pkce_states" (
	"state" text PRIMARY KEY NOT NULL,
	"server_uuid" uuid NOT NULL,
	"code_verifier" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_pkce_states" ADD CONSTRAINT "oauth_pkce_states_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_oauth_pkce_states_expires_at" ON "oauth_pkce_states" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_oauth_pkce_states_server_uuid" ON "oauth_pkce_states" USING btree ("server_uuid");