-- Production Schema Fixes Migration
-- This comprehensive migration ensures all tables have the correct structure
-- matching the development database to prevent runtime errors
-- Date: 2025-08-22

-- ============================================================================
-- 1. CONVERSATION_MEMORIES TABLE
-- ============================================================================
ALTER TABLE conversation_memories 
ADD COLUMN IF NOT EXISTS source_ref TEXT,
ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ============================================================================
-- 2. SYSTEM_LOGS TABLE
-- ============================================================================
ALTER TABLE system_logs
ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ============================================================================
-- 3. WORKFLOW_TASKS TABLE
-- ============================================================================
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

-- ============================================================================
-- 4. CONVERSATION_TASKS TABLE - Structure
-- ============================================================================
-- Add missing columns first
ALTER TABLE conversation_tasks
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS memory_id UUID,
ADD COLUMN IF NOT EXISTS due_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS workflow_task_id UUID,
ADD COLUMN IF NOT EXISTS is_workflow_generated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS workflow_metadata JSONB DEFAULT '{}'::jsonb;

-- ============================================================================
-- 5. CONVERSATION_TASKS TABLE - Priority Column Type Conversion
-- ============================================================================
-- Convert priority from INTEGER to VARCHAR if needed
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
    END IF;
END $$;

-- ============================================================================
-- 6. CONVERSATION_TASKS TABLE - Constraints and Defaults
-- ============================================================================
-- Handle NULL values before adding NOT NULL constraints
UPDATE conversation_tasks 
SET title = 'Untitled Task' 
WHERE title IS NULL;

UPDATE conversation_tasks 
SET priority = 'medium' 
WHERE priority IS NULL;

UPDATE conversation_tasks 
SET status = 'pending' 
WHERE status IS NULL;

-- Now add the constraints
DO $$ 
BEGIN
    -- Make title NOT NULL if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversation_tasks' 
        AND column_name = 'title'
    ) THEN
        ALTER TABLE conversation_tasks 
        ALTER COLUMN title SET NOT NULL;
    END IF;

    -- Set priority constraints
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversation_tasks' 
        AND column_name = 'priority'
    ) THEN
        ALTER TABLE conversation_tasks 
        ALTER COLUMN priority SET NOT NULL,
        ALTER COLUMN priority SET DEFAULT 'medium';
    END IF;

    -- Set status constraints
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversation_tasks' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE conversation_tasks 
        ALTER COLUMN status SET NOT NULL,
        ALTER COLUMN status SET DEFAULT 'pending';
    END IF;

    -- Make task_type nullable with default
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversation_tasks' 
        AND column_name = 'task_type'
    ) THEN
        ALTER TABLE conversation_tasks 
        ALTER COLUMN task_type DROP NOT NULL,
        ALTER COLUMN task_type SET DEFAULT 'task';
    END IF;

    -- Make workflow_id nullable
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversation_tasks' 
        AND column_name = 'workflow_id'
    ) THEN
        ALTER TABLE conversation_tasks 
        ALTER COLUMN workflow_id DROP NOT NULL;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- Log but don't fail if constraints already exist
        RAISE NOTICE 'Some constraints may already exist: %', SQLERRM;
END $$;

-- ============================================================================
-- 7. WORKFLOW_TEMPLATES TABLE
-- ============================================================================
ALTER TABLE workflow_templates
ADD COLUMN IF NOT EXISTS success_rate REAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS average_completion_time INTEGER,
ADD COLUMN IF NOT EXISTS optimization_history JSONB DEFAULT '[]'::jsonb;

-- ============================================================================
-- 8. WORKFLOW_EXECUTIONS TABLE - Additional Columns
-- ============================================================================
ALTER TABLE workflow_executions
ADD COLUMN IF NOT EXISTS action VARCHAR(100),
ADD COLUMN IF NOT EXISTS actor VARCHAR(100),
ADD COLUMN IF NOT EXISTS input_data JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS output_data JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS error_details JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
ADD COLUMN IF NOT EXISTS input JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS output JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS step_index INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3;

-- ============================================================================
-- 9. WORKFLOW_EXECUTIONS TABLE - Constraints
-- ============================================================================
DO $$ 
BEGIN
    -- Make task_id nullable
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'workflow_executions' 
        AND column_name = 'task_id'
        AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE workflow_executions 
        ALTER COLUMN task_id DROP NOT NULL;
    END IF;

    -- Add default for status
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'workflow_executions' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE workflow_executions 
        ALTER COLUMN status SET DEFAULT 'pending';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Some workflow_executions constraints may already exist: %', SQLERRM;
END $$;

-- ============================================================================
-- 10. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================
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

CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow
ON workflow_executions(workflow_id);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_task
ON workflow_executions(task_id);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_status
ON workflow_executions(status);

CREATE INDEX IF NOT EXISTS idx_system_logs_created
ON system_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_system_logs_level
ON system_logs(level);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- This migration ensures all tables have the correct structure to prevent
-- runtime errors. All changes are idempotent and safe to run multiple times.