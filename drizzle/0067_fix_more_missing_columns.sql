-- Fix additional missing columns in conversation_memories and workflow_templates tables

-- Add source column to conversation_memories if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'conversation_memories' 
                   AND column_name = 'source') THEN
        ALTER TABLE conversation_memories ADD COLUMN source varchar(64) NOT NULL DEFAULT 'user';
    END IF;
END $$;

-- Add success_rate column to workflow_templates if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'workflow_templates' 
                   AND column_name = 'success_rate') THEN
        ALTER TABLE workflow_templates ADD COLUMN success_rate numeric(5, 2) DEFAULT 0;
    END IF;
END $$;

-- Add average_completion_time column to workflow_templates if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'workflow_templates' 
                   AND column_name = 'average_completion_time') THEN
        ALTER TABLE workflow_templates ADD COLUMN average_completion_time interval;
    END IF;
END $$;

-- Add optimization_history column to workflow_templates if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'workflow_templates' 
                   AND column_name = 'optimization_history') THEN
        ALTER TABLE workflow_templates ADD COLUMN optimization_history jsonb DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- Add version column to workflow_templates if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'workflow_templates' 
                   AND column_name = 'version') THEN
        ALTER TABLE workflow_templates ADD COLUMN version integer DEFAULT 1;
    END IF;
END $$;

-- Add is_active column to workflow_templates if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'workflow_templates' 
                   AND column_name = 'is_active') THEN
        ALTER TABLE workflow_templates ADD COLUMN is_active boolean DEFAULT true;
    END IF;
END $$;