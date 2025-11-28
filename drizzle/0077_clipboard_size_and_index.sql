-- Increase clipboard size limit from 256KB to 2MB
-- and add composite index for ORDER BY created_at DESC queries

-- Drop the old size check constraint
ALTER TABLE "clipboards" DROP CONSTRAINT IF EXISTS "clipboards_size_check";

-- Add new size check constraint with 2MB limit (2097152 bytes)
ALTER TABLE "clipboards" ADD CONSTRAINT "clipboards_size_check" CHECK ("size_bytes" <= 2097152);

-- Add composite index for efficient ORDER BY created_at DESC queries
CREATE INDEX IF NOT EXISTS "clipboards_profile_created_at_idx" ON "clipboards" USING btree ("profile_uuid", "created_at" DESC);
