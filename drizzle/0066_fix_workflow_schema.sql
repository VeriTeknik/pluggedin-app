-- Comprehensive fix for workflow schema issues
-- This migration ensures all required columns exist

-- 1. Fix conversation_workflows table
DO $$ 
BEGIN
    -- Add learned_optimizations if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversation_workflows' 
        AND column_name = 'learned_optimizations'
    ) THEN
        ALTER TABLE conversation_workflows 
        ADD COLUMN learned_optimizations jsonb DEFAULT '{}';
        RAISE NOTICE 'Added learned_optimizations column to conversation_workflows';
    END IF;
END $$;

-- 2. Fix conversation_tasks table
DO $$ 
BEGIN
    -- Add workflow_task_id if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversation_tasks' 
        AND column_name = 'workflow_task_id'
    ) THEN
        ALTER TABLE conversation_tasks 
        ADD COLUMN workflow_task_id uuid;
        RAISE NOTICE 'Added workflow_task_id column to conversation_tasks';
    END IF;
    
    -- Add is_workflow_generated if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversation_tasks' 
        AND column_name = 'is_workflow_generated'
    ) THEN
        ALTER TABLE conversation_tasks 
        ADD COLUMN is_workflow_generated boolean DEFAULT false;
        RAISE NOTICE 'Added is_workflow_generated column to conversation_tasks';
    END IF;
    
    -- Add workflow_metadata if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversation_tasks' 
        AND column_name = 'workflow_metadata'
    ) THEN
        ALTER TABLE conversation_tasks 
        ADD COLUMN workflow_metadata jsonb DEFAULT '{}';
        RAISE NOTICE 'Added workflow_metadata column to conversation_tasks';
    END IF;
    
    -- Add foreign key constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'conversation_tasks_workflow_task_id_fkey'
    ) THEN
        -- Only add if workflow_tasks table exists
        IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'workflow_tasks'
        ) THEN
            ALTER TABLE conversation_tasks
            ADD CONSTRAINT conversation_tasks_workflow_task_id_fkey 
            FOREIGN KEY (workflow_task_id) 
            REFERENCES workflow_tasks(id) 
            ON DELETE SET NULL;
            RAISE NOTICE 'Added foreign key constraint for workflow_task_id';
        END IF;
    END IF;
END $$;

-- 3. Ensure workflow_dependencies table exists
CREATE TABLE IF NOT EXISTS workflow_dependencies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id uuid NOT NULL,
    depends_on_task_id uuid NOT NULL,
    dependency_type varchar(20) DEFAULT 'required',
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workflow_dependencies_task_id_fkey 
        FOREIGN KEY (task_id) REFERENCES workflow_tasks(id) ON DELETE CASCADE,
    CONSTRAINT workflow_dependencies_depends_on_task_id_fkey 
        FOREIGN KEY (depends_on_task_id) REFERENCES workflow_tasks(id) ON DELETE CASCADE
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_workflow_dependencies_task ON workflow_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_workflow_dependencies_depends_on ON workflow_dependencies(depends_on_task_id);

-- 4. Verify all columns exist (will show what was actually done)
SELECT 
    'conversation_workflows' as table_name,
    column_name,
    data_type,
    column_default
FROM information_schema.columns 
WHERE table_name = 'conversation_workflows'
AND column_name = 'learned_optimizations'
UNION ALL
SELECT 
    'conversation_tasks' as table_name,
    column_name,
    data_type,
    column_default
FROM information_schema.columns 
WHERE table_name = 'conversation_tasks'
AND column_name IN ('workflow_task_id', 'is_workflow_generated', 'workflow_metadata')
ORDER BY table_name, column_name;