-- Fix task_type column to be nullable with default
ALTER TABLE conversation_tasks 
ALTER COLUMN task_type DROP NOT NULL,
ALTER COLUMN task_type SET DEFAULT 'task';

-- Make workflow_id nullable as it's not always provided
ALTER TABLE conversation_tasks 
ALTER COLUMN workflow_id DROP NOT NULL;