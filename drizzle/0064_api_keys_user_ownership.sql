-- API Keys User Ownership Migration
-- Makes API keys user-owned instead of project-owned
-- Safe to run multiple times with IF EXISTS/IF NOT EXISTS checks

-- Drop existing foreign key constraint if it exists
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_project_uuid_projects_uuid_fk";
--> statement-breakpoint

-- Make project_uuid nullable (keys can exist without projects)
ALTER TABLE "api_keys" ALTER COLUMN "project_uuid" DROP NOT NULL;
--> statement-breakpoint

-- Add new columns for user ownership and permissions
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "user_id" text;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "original_project_uuid" uuid;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "all_projects_access" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "project_permissions" uuid[];
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "usage_count" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "last_used_ip" text;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 0;
--> statement-breakpoint

-- Set default values for NULL columns
UPDATE api_keys SET all_projects_access = false WHERE all_projects_access IS NULL;
--> statement-breakpoint
UPDATE api_keys SET is_active = true WHERE is_active IS NULL;
--> statement-breakpoint
UPDATE api_keys SET updated_at = NOW() WHERE updated_at IS NULL;
--> statement-breakpoint
UPDATE api_keys SET usage_count = 0 WHERE usage_count IS NULL;
--> statement-breakpoint
UPDATE api_keys SET version = 0 WHERE version IS NULL;
--> statement-breakpoint

-- Add NOT NULL constraints after setting defaults
ALTER TABLE "api_keys" ALTER COLUMN "all_projects_access" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "is_active" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "updated_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "usage_count" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "version" SET NOT NULL;
--> statement-breakpoint

-- Add foreign key constraints
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_user_id_users_id_fk') THEN
    ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_project_uuid_projects_uuid_fk') THEN
    ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_uuid_projects_uuid_fk" FOREIGN KEY ("project_uuid") REFERENCES "public"."projects"("uuid") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_api_key_idx" ON "api_keys" USING btree ("api_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_is_active_idx" ON "api_keys" USING btree ("is_active") WHERE is_active = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_orphaned_idx" ON "api_keys" USING btree ("user_id") WHERE user_id IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_project_uuid_idx" ON "api_keys" USING btree ("project_uuid");
--> statement-breakpoint

-- Populate user_id from existing project relationships (only for records without user_id)
UPDATE api_keys ak
SET
  user_id = p.user_id,
  project_permissions = CASE
    WHEN ak.project_permissions IS NULL AND ak.project_uuid IS NOT NULL THEN ARRAY[ak.project_uuid]::UUID[]
    ELSE ak.project_permissions
  END,
  original_project_uuid = COALESCE(ak.original_project_uuid, ak.project_uuid)
FROM projects p
WHERE ak.project_uuid = p.uuid
  AND ak.user_id IS NULL;
--> statement-breakpoint

-- Handle orphaned keys (projects have been deleted)
UPDATE api_keys
SET
  is_active = false,
  project_permissions = CASE
    WHEN project_permissions IS NULL AND project_uuid IS NOT NULL THEN ARRAY[project_uuid]::UUID[]
    ELSE project_permissions
  END,
  original_project_uuid = COALESCE(original_project_uuid, project_uuid)
WHERE user_id IS NULL
  AND project_uuid IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM projects p WHERE p.uuid = api_keys.project_uuid
  );