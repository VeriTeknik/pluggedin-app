-- Comprehensive fix for system_logs table to match schema.ts
-- This consolidates the column fixes needed for the system_logs table

DO $$
BEGIN
    -- Rename timestamp to created_at if timestamp exists
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'system_logs' AND column_name = 'timestamp') THEN
        ALTER TABLE "system_logs" RENAME COLUMN "timestamp" TO "created_at";
    END IF;
    
    -- Rename context to details if context exists
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'system_logs' AND column_name = 'context') THEN
        ALTER TABLE "system_logs" RENAME COLUMN "context" TO "details";
    END IF;
    
    -- Add created_at if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'system_logs' AND column_name = 'created_at') THEN
        ALTER TABLE "system_logs" ADD COLUMN "created_at" timestamp with time zone NOT NULL DEFAULT now();
    END IF;
    
    -- Add details if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'system_logs' AND column_name = 'details') THEN
        ALTER TABLE "system_logs" ADD COLUMN "details" jsonb;
    END IF;
    
    -- Ensure source column exists (from earlier migration)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'system_logs' AND column_name = 'source') THEN
        ALTER TABLE "system_logs" ADD COLUMN "source" text NOT NULL DEFAULT 'UNKNOWN';
    END IF;
    
    -- Drop columns that are not in schema.ts
    ALTER TABLE "system_logs" 
      DROP COLUMN IF EXISTS "module",
      DROP COLUMN IF EXISTS "user_id",
      DROP COLUMN IF EXISTS "profile_uuid",
      DROP COLUMN IF EXISTS "session_id",
      DROP COLUMN IF EXISTS "request_id";
    
    -- Fix the level column type if needed (convert from custom type to text)
    ALTER TABLE "system_logs" 
      ALTER COLUMN "level" TYPE text;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS "system_logs_level_idx" ON "system_logs" ("level");
CREATE INDEX IF NOT EXISTS "system_logs_source_idx" ON "system_logs" ("source");
CREATE INDEX IF NOT EXISTS "system_logs_created_at_idx" ON "system_logs" ("created_at");

-- Create GIN index for jsonb details column
CREATE INDEX IF NOT EXISTS "system_logs_details_idx" ON "system_logs" USING gin ("details");