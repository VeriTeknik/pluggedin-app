-- Add workflow-related columns to conversation_tasks table
ALTER TABLE "conversation_tasks" 
ADD COLUMN IF NOT EXISTS "workflow_task_id" uuid,
ADD COLUMN IF NOT EXISTS "is_workflow_generated" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "workflow_metadata" jsonb DEFAULT '{}';

-- Add foreign key constraint for workflow_task_id
ALTER TABLE "conversation_tasks"
ADD CONSTRAINT "conversation_tasks_workflow_task_id_fkey" 
FOREIGN KEY ("workflow_task_id") 
REFERENCES "workflow_tasks"("id") 
ON DELETE SET NULL;