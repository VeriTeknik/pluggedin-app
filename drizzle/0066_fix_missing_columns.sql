-- Fix missing columns in system_logs and conversation_memories tables

-- Add source column to system_logs if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'system_logs' 
                   AND column_name = 'source') THEN
        ALTER TABLE system_logs ADD COLUMN source varchar(64) NOT NULL DEFAULT 'SYSTEM';
    END IF;
END $$;

-- Add pii column to conversation_memories if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'conversation_memories' 
                   AND column_name = 'pii') THEN
        ALTER TABLE conversation_memories ADD COLUMN pii boolean NOT NULL DEFAULT false;
    END IF;
END $$;