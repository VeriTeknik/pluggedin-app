-- Migration: Add missing columns to workflow_tasks table to match schema.ts

-- Add missing columns
ALTER TABLE workflow_tasks 
ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES workflow_tasks(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS data_collected JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS validation_rules JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS retry_strategy VARCHAR(50) DEFAULT 'exponential',
ADD COLUMN IF NOT EXISTS estimated_duration INTERVAL,
ADD COLUMN IF NOT EXISTS actual_duration INTERVAL,
ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS failed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS failure_reason TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Create additional indexes
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_parent ON workflow_tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_scheduled ON workflow_tasks(scheduled_for) WHERE scheduled_for IS NOT NULL;

-- Add comments
COMMENT ON COLUMN workflow_tasks.parent_task_id IS 'Reference to parent task for hierarchical task structures';
COMMENT ON COLUMN workflow_tasks.data_collected IS 'Data collected during task execution';
COMMENT ON COLUMN workflow_tasks.validation_rules IS 'Validation rules for collected data';
COMMENT ON COLUMN workflow_tasks.retry_count IS 'Number of retry attempts';
COMMENT ON COLUMN workflow_tasks.max_retries IS 'Maximum number of retries allowed';
COMMENT ON COLUMN workflow_tasks.retry_strategy IS 'Retry strategy (linear, exponential, etc.)';
COMMENT ON COLUMN workflow_tasks.estimated_duration IS 'Estimated time to complete the task';
COMMENT ON COLUMN workflow_tasks.actual_duration IS 'Actual time taken to complete the task';
COMMENT ON COLUMN workflow_tasks.scheduled_for IS 'Scheduled execution time for the task';
COMMENT ON COLUMN workflow_tasks.failed_at IS 'Timestamp when the task failed';
COMMENT ON COLUMN workflow_tasks.failure_reason IS 'Reason for task failure';
COMMENT ON COLUMN workflow_tasks.metadata IS 'Additional metadata for the task';