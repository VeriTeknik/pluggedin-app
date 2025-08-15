-- Migration: Clean up old task system tables
-- These tables are no longer used after implementing the workflow system

-- Drop old task-related tables (if they exist)
DROP TABLE IF EXISTS task_steps CASCADE;
DROP TABLE IF EXISTS task_context CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;

-- Add comment to explain the current task system
COMMENT ON TABLE conversation_tasks IS 'Main task management table for conversations, including both manual and workflow-generated tasks';
COMMENT ON TABLE workflow_tasks IS 'Workflow engine task tracking for multi-step processes';

-- Ensure proper indexes exist for the new workflow system
CREATE INDEX IF NOT EXISTS idx_conversation_tasks_workflow_generated 
ON conversation_tasks(is_workflow_generated) 
WHERE is_workflow_generated = true;

CREATE INDEX IF NOT EXISTS idx_conversation_tasks_conversation_status
ON conversation_tasks(conversation_id, status);

-- Add a view for easier querying of workflow tasks
CREATE OR REPLACE VIEW workflow_task_overview AS
SELECT 
  ct.id,
  ct.conversation_id,
  ct.title,
  ct.description,
  ct.status,
  ct.priority,
  ct.due_date,
  ct.is_workflow_generated,
  ct.workflow_metadata,
  wt.task_type as workflow_task_type,
  wt.step_index as workflow_step,
  cw.template_id as workflow_template,
  cw.status as workflow_status,
  cw.progress as workflow_progress
FROM conversation_tasks ct
LEFT JOIN workflow_tasks wt ON ct.workflow_task_id = wt.id
LEFT JOIN conversation_workflows cw ON wt.workflow_id = cw.id
WHERE ct.is_workflow_generated = true;

COMMENT ON VIEW workflow_task_overview IS 'Consolidated view of workflow-generated tasks with their workflow context';