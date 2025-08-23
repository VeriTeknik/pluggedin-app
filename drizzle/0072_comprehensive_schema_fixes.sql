-- Comprehensive schema fixes for all tables
-- This migration ensures all required columns exist with correct types

-- Fix conversation_memories table
ALTER TABLE conversation_memories 
ADD COLUMN IF NOT EXISTS source_ref TEXT,
ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Fix system_logs table
ALTER TABLE system_logs
ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Fix workflow_tasks table
ALTER TABLE workflow_tasks
ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS failed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS failure_reason TEXT,
ADD COLUMN IF NOT EXISTS retry_strategy VARCHAR(20) DEFAULT 'exponential',
ADD COLUMN IF NOT EXISTS estimated_duration INTEGER,
ADD COLUMN IF NOT EXISTS actual_duration INTEGER,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Fix conversation_tasks table
ALTER TABLE conversation_tasks
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS memory_id UUID,
ADD COLUMN IF NOT EXISTS due_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS workflow_task_id UUID,
ADD COLUMN IF NOT EXISTS is_workflow_generated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS workflow_metadata JSONB DEFAULT '{}'::jsonb;

-- Convert priority column type if needed (from integer to varchar)
DO $$ 
BEGIN
    -- Check if priority column is integer
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'conversation_tasks' 
        AND column_name = 'priority' 
        AND data_type = 'integer'
    ) THEN
        -- Convert priority from integer to varchar
        ALTER TABLE conversation_tasks 
        ALTER COLUMN priority TYPE VARCHAR(20) 
        USING CASE 
            WHEN priority = 1 THEN 'low'
            WHEN priority = 2 THEN 'medium'
            WHEN priority = 3 THEN 'high'
            ELSE 'medium'
        END;
        
        ALTER TABLE conversation_tasks 
        ALTER COLUMN priority SET DEFAULT 'medium';
    END IF;
END $$;

-- Fix workflow_templates table
ALTER TABLE workflow_templates
ADD COLUMN IF NOT EXISTS success_rate REAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS average_completion_time INTEGER,
ADD COLUMN IF NOT EXISTS optimization_history JSONB DEFAULT '[]'::jsonb;

-- Add indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_conversation_tasks_conversation 
ON conversation_tasks(conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversation_tasks_workflow 
ON conversation_tasks(workflow_task_id);

CREATE INDEX IF NOT EXISTS idx_workflow_tasks_workflow 
ON workflow_tasks(workflow_id);

CREATE INDEX IF NOT EXISTS idx_workflow_tasks_scheduled 
ON workflow_tasks(scheduled_for);

CREATE INDEX IF NOT EXISTS idx_conversation_memories_conversation 
ON conversation_memories(conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversation_memories_owner 
ON conversation_memories(owner_id);