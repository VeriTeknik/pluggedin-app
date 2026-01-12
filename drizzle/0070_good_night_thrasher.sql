ALTER TABLE "oauth_pkce_states" ADD COLUMN IF NOT EXISTS "user_id" text;--> statement-breakpoint
ALTER TABLE "oauth_pkce_states" ADD CONSTRAINT "oauth_pkce_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_oauth_tokens_server_expires" ON "mcp_server_oauth_tokens" USING btree ("server_uuid","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_oauth_pkce_states_user_id" ON "oauth_pkce_states" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_oauth_pkce_states_state_user" ON "oauth_pkce_states" USING btree ("state","user_id");--> statement-breakpoint
ALTER TABLE "mcp_server_oauth_tokens" ADD CONSTRAINT "mcp_server_oauth_tokens_server_uuid_unique" UNIQUE("server_uuid");