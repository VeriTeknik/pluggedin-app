-- Force add source column to system_logs
ALTER TABLE "system_logs" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'UNKNOWN';

-- Create index on source column if it doesn't exist
CREATE INDEX IF NOT EXISTS "system_logs_source_idx" ON "system_logs" ("source");

-- Update any existing rows to have a proper source value
UPDATE "system_logs" SET "source" = 'LEGACY' WHERE "source" = 'UNKNOWN';