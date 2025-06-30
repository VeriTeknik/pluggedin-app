CREATE TABLE IF NOT EXISTS "github_app_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"installation_id" varchar(255) NOT NULL,
	"access_token" text,
	"token_type" varchar(50),
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_app_installations_user_installation_unique" UNIQUE("user_id","installation_id")
);
--> statement-breakpoint
ALTER TABLE "github_app_installations" ADD CONSTRAINT "github_app_installations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_github_app_installations_user_id" ON "github_app_installations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_github_app_installations_installation_id" ON "github_app_installations" USING btree ("installation_id");