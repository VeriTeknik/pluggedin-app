ALTER TABLE "mcp_activity" ADD COLUMN "status" text DEFAULT 'success';--> statement-breakpoint
ALTER TABLE "mcp_activity" ADD COLUMN "error_message" text;--> statement-breakpoint
CREATE INDEX "idx_profile_action_status" ON "mcp_activity" USING btree ("profile_uuid","action","status");