CREATE TABLE "registry_oauth_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"session_token_hash" varchar(64) NOT NULL,
	"oauth_token" text NOT NULL,
	"github_username" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "registry_oauth_sessions_session_token_hash_unique" UNIQUE("session_token_hash")
);
--> statement-breakpoint
ALTER TABLE "registry_oauth_sessions" ADD CONSTRAINT "registry_oauth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_registry_oauth_sessions_user_id" ON "registry_oauth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_registry_oauth_sessions_token_hash" ON "registry_oauth_sessions" USING btree ("session_token_hash");--> statement-breakpoint
CREATE INDEX "idx_registry_oauth_sessions_expires_at" ON "registry_oauth_sessions" USING btree ("expires_at");