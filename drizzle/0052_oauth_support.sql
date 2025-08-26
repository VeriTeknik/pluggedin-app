-- Add OAuth client registration support for MCP connectors
CREATE TABLE IF NOT EXISTS "oauth_clients" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id" TEXT UNIQUE NOT NULL,
  "client_secret_hash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "redirect_uris" TEXT[] NOT NULL,
  "grant_types" TEXT[] DEFAULT ARRAY['authorization_code'],
  "response_types" TEXT[] DEFAULT ARRAY['code'],
  "scope" TEXT DEFAULT 'mcp:read mcp:execute',
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add OAuth authorization codes table
CREATE TABLE IF NOT EXISTS "oauth_authorization_codes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" TEXT UNIQUE NOT NULL,
  "client_id" TEXT NOT NULL REFERENCES "oauth_clients"("client_id") ON DELETE CASCADE,
  "profile_uuid" UUID NOT NULL REFERENCES "profiles"("uuid") ON DELETE CASCADE,
  "redirect_uri" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "code_challenge" TEXT,
  "code_challenge_method" TEXT,
  "expires_at" TIMESTAMP NOT NULL,
  "used_at" TIMESTAMP,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add OAuth tokens table
CREATE TABLE IF NOT EXISTS "oauth_tokens" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "access_token_hash" TEXT UNIQUE NOT NULL,
  "refresh_token_hash" TEXT UNIQUE,
  "client_id" TEXT NOT NULL REFERENCES "oauth_clients"("client_id") ON DELETE CASCADE,
  "profile_uuid" UUID NOT NULL REFERENCES "profiles"("uuid") ON DELETE CASCADE,
  "scope" TEXT NOT NULL,
  "expires_at" TIMESTAMP NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "last_used_at" TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX "oauth_clients_client_id_idx" ON "oauth_clients" ("client_id");
CREATE INDEX "oauth_authorization_codes_code_idx" ON "oauth_authorization_codes" ("code");
CREATE INDEX "oauth_authorization_codes_client_id_idx" ON "oauth_authorization_codes" ("client_id");
CREATE INDEX "oauth_tokens_access_token_hash_idx" ON "oauth_tokens" ("access_token_hash");
CREATE INDEX "oauth_tokens_refresh_token_hash_idx" ON "oauth_tokens" ("refresh_token_hash");
CREATE INDEX "oauth_tokens_client_id_idx" ON "oauth_tokens" ("client_id");
CREATE INDEX "oauth_tokens_profile_uuid_idx" ON "oauth_tokens" ("profile_uuid");