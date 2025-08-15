-- Migration: Create conversation_workflows and workflow_tasks tables
-- These tables track workflow instances and their tasks

-- Create conversation_workflows table
CREATE TABLE IF NOT EXISTS conversation_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(uuid) ON DELETE CASCADE,
  template_id VARCHAR(100) REFERENCES workflow_templates(id),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'failed', 'cancelled')),
  context JSONB DEFAULT '{}',
  progress NUMERIC(5,2) DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create workflow_tasks table
CREATE TABLE IF NOT EXISTS workflow_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES conversation_workflows(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  task_type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'failed', 'skipped')),
  input_data JSONB DEFAULT '{}',
  output_data JSONB DEFAULT '{}',
  error_message TEXT,
  prerequisites UUID[],
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_conversation_workflows_conversation ON conversation_workflows(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_workflows_status ON conversation_workflows(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_conversation_workflows_template ON conversation_workflows(template_id);

CREATE INDEX IF NOT EXISTS idx_workflow_tasks_workflow ON workflow_tasks(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_status ON workflow_tasks(status);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_prerequisites ON workflow_tasks USING GIN(prerequisites);

-- Add comments
COMMENT ON TABLE conversation_workflows IS 'Tracks active workflow instances for conversations';
COMMENT ON COLUMN conversation_workflows.id IS 'Unique workflow instance ID';
COMMENT ON COLUMN conversation_workflows.conversation_id IS 'Reference to the chat conversation';
COMMENT ON COLUMN conversation_workflows.template_id IS 'Reference to the workflow template used';
COMMENT ON COLUMN conversation_workflows.context IS 'Workflow context including user data, memories, and capabilities';
COMMENT ON COLUMN conversation_workflows.progress IS 'Percentage of workflow completion';

COMMENT ON TABLE workflow_tasks IS 'Individual tasks within a workflow instance';
COMMENT ON COLUMN workflow_tasks.workflow_id IS 'Reference to the parent workflow';
COMMENT ON COLUMN workflow_tasks.step_index IS 'Order of the task in the workflow';
COMMENT ON COLUMN workflow_tasks.task_type IS 'Type of task (collect_info, validate, execute, etc.)';
COMMENT ON COLUMN workflow_tasks.prerequisites IS 'Array of task IDs that must complete before this task';
COMMENT ON COLUMN workflow_tasks.input_data IS 'Input data for the task';
COMMENT ON COLUMN workflow_tasks.output_data IS 'Output data from the task execution';