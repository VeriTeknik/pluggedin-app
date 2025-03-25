-- Check if account table exists (singular form) and rename it to accounts (plural form)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'account') THEN
        ALTER TABLE account RENAME TO accounts;
    END IF;
END $$;

-- Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS "users" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text,
    "email" text NOT NULL,
    "email_verified" timestamp,
    "image" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create accounts table if it doesn't exist
CREATE TABLE IF NOT EXISTS "accounts" (
    "user_id" text NOT NULL,
    "type" text NOT NULL,
    "provider" text NOT NULL,
    "provider_account_id" text NOT NULL,
    "refresh_token" text,
    "access_token" text,
    "expires_at" integer,
    "token_type" text,
    "scope" text,
    "id_token" text,
    "session_state" text,
    CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);

-- Create sessions table if it doesn't exist
CREATE TABLE IF NOT EXISTS "sessions" (
    "session_token" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "expires" timestamp NOT NULL
);

-- Create verification_tokens table if it doesn't exist
CREATE TABLE IF NOT EXISTS "verification_tokens" (
    "identifier" text NOT NULL,
    "token" text NOT NULL,
    "expires" timestamp NOT NULL,
    CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);

-- Add foreign key constraints if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'accounts_user_id_users_id_fk'
    ) THEN
        ALTER TABLE "accounts" 
        ADD CONSTRAINT "accounts_user_id_users_id_fk" 
        FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") 
        ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_users_id_fk'
    ) THEN
        ALTER TABLE "sessions" 
        ADD CONSTRAINT "sessions_user_id_users_id_fk" 
        FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") 
        ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
END $$;

-- Create indices if they don't exist
CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" USING btree ("user_id"); 