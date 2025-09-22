-- Add source column to system_logs if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'system_logs' 
        AND column_name = 'source'
    ) THEN
        ALTER TABLE "system_logs" ADD COLUMN "source" text NOT NULL DEFAULT 'UNKNOWN';
        
        -- Create index on source column if it doesn't exist
        CREATE INDEX IF NOT EXISTS "system_logs_source_idx" ON "system_logs" ("source");
    END IF;
END $$;