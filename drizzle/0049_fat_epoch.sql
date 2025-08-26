-- Create OAuth tables if they don't exist
CREATE TABLE IF NOT EXISTS "oauth_authorization_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"client_id" text NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"redirect_uri" text NOT NULL,
	"scope" text NOT NULL,
	"code_challenge" text,
	"code_challenge_method" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_authorization_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_hash" text NOT NULL,
	"name" text NOT NULL,
	"redirect_uris" text[] NOT NULL,
	"grant_types" text[] DEFAULT '{"authorization_code"}',
	"response_types" text[] DEFAULT '{"code"}',
	"scope" text DEFAULT 'mcp:read mcp:execute',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_clients_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"access_token_hash" text NOT NULL,
	"refresh_token_hash" text,
	"client_id" text NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"scope" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "oauth_tokens_access_token_hash_unique" UNIQUE("access_token_hash"),
	CONSTRAINT "oauth_tokens_refresh_token_hash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
-- Add foreign keys only if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oauth_authorization_codes_client_id_oauth_clients_client_id_fk') THEN
        ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oauth_authorization_codes_profile_uuid_profiles_uuid_fk') THEN
        ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oauth_tokens_client_id_oauth_clients_client_id_fk') THEN
        ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oauth_tokens_profile_uuid_profiles_uuid_fk') THEN
        ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
-- Create indexes only if they don't exist
CREATE INDEX IF NOT EXISTS "oauth_authorization_codes_code_idx" ON "oauth_authorization_codes" USING btree ("code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_authorization_codes_client_id_idx" ON "oauth_authorization_codes" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_clients_client_id_idx" ON "oauth_clients" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_tokens_access_token_hash_idx" ON "oauth_tokens" USING btree ("access_token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_tokens_refresh_token_hash_idx" ON "oauth_tokens" USING btree ("refresh_token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_tokens_client_id_idx" ON "oauth_tokens" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_tokens_profile_uuid_idx" ON "oauth_tokens" USING btree ("profile_uuid");