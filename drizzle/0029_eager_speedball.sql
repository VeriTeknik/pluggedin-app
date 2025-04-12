ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_key_unique_idx";--> statement-breakpoint
ALTER TABLE "custom_instructions" DROP CONSTRAINT "custom_instructions_unique_server_idx";--> statement-breakpoint
-- Removed DROP CONSTRAINT and DROP INDEX for profiles.username
-- ALTER TABLE "profiles" DROP CONSTRAINT "profiles_username_unique";--> statement-breakpoint
-- DROP INDEX "profiles_username_idx";--> statement-breakpoint
DROP INDEX "server_ratings_unique_idx";--> statement-breakpoint
DROP INDEX "server_ratings_unique_external_idx";--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD PRIMARY KEY ("token");--> statement-breakpoint
-- Removed ADD COLUMN username to users (handled in 0026)
-- ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
-- Removed CREATE INDEX for users.username (handled in 0026)
-- CREATE INDEX "users_username_idx" ON "users" USING btree ("username");--> statement-breakpoint
-- Removed DROP COLUMN username from profiles
-- ALTER TABLE "profiles" DROP COLUMN "username";--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_api_key_unique" UNIQUE("api_key");--> statement-breakpoint
ALTER TABLE "custom_instructions" ADD CONSTRAINT "custom_instructions_mcp_server_uuid_unique" UNIQUE("mcp_server_uuid");--> statement-breakpoint
ALTER TABLE "playground_settings" ADD CONSTRAINT "playground_settings_profile_uuid_unique" UNIQUE("profile_uuid");--> statement-breakpoint
ALTER TABLE "server_ratings" ADD CONSTRAINT "server_ratings_unique_idx" UNIQUE("profile_uuid","server_uuid");--> statement-breakpoint
ALTER TABLE "server_ratings" ADD CONSTRAINT "server_ratings_unique_external_idx" UNIQUE("profile_uuid","external_id","source");--> statement-breakpoint
-- Removed ADD CONSTRAINT for users.username (handled in 0026)
-- ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");
