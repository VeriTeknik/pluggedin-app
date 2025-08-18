-- Fix system_logs table to match the schema
-- Add missing columns and rename existing ones

-- Add details column if it doesn't exist
ALTER TABLE "system_logs" 
ADD COLUMN IF NOT EXISTS "details" jsonb;

-- Add created_at column if it doesn't exist
ALTER TABLE "system_logs" 
ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone NOT NULL DEFAULT now();

-- Copy data from context to details if context exists and details is empty
UPDATE "system_logs" 
SET "details" = "context" 
WHERE "details" IS NULL AND "context" IS NOT NULL;

-- Copy data from timestamp to created_at if timestamp exists
UPDATE "system_logs" 
SET "created_at" = "timestamp" 
WHERE "timestamp" IS NOT NULL;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS "system_logs_created_at_idx" ON "system_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "system_logs_source_idx" ON "system_logs" ("source");