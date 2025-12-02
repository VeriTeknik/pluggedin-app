ALTER TABLE "mcp_activity" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'success';--> statement-breakpoint
ALTER TABLE "mcp_activity" ADD COLUMN IF NOT EXISTS "error_message" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profile_action_status" ON "mcp_activity" USING btree ("profile_uuid","action","status");