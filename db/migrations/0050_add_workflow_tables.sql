-- Migration: Add Intelligent Workflow System Tables
-- This migration creates the foundation for the intelligent workflow orchestration system
-- that enables AI-powered task generation, dependency management, and workflow learning.

-- ============================================
-- Workflow Templates Table
-- ============================================
-- Stores reusable workflow templates that can be instantiated for conversations
CREATE TABLE IF NOT EXISTS workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- 'scheduling', 'support', 'communication', 'data_collection', etc.
  description TEXT,
  base_structure JSONB NOT NULL, -- Template structure with steps and dependencies
  required_capabilities TEXT[], -- Required persona capabilities for this workflow
  success_rate NUMERIC(5,2) DEFAULT 0, -- Success rate percentage (0-100)
  average_completion_time INTERVAL, -- Average time to complete
  optimization_history JSONB[] DEFAULT '{}', -- History of optimizations applied
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for active templates by category
CREATE INDEX idx_workflow_templates_category ON workflow_templates(category) WHERE is_active = true;

-- ============================================
-- Conversation Workflows Table
-- ============================================
-- Tracks workflow instances for specific conversations
CREATE TABLE IF NOT EXISTS conversation_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(uuid) ON DELETE CASCADE,
  template_id UUID REFERENCES workflow_templates(id),
  status VARCHAR(20) NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed', 'failed', 'cancelled')),
  context JSONB DEFAULT '{}', -- Workflow-specific context and state
  learned_optimizations JSONB DEFAULT '{}', -- Optimizations learned during execution
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for workflow queries
CREATE INDEX idx_conversation_workflows_conversation ON conversation_workflows(conversation_id);
CREATE INDEX idx_conversation_workflows_status ON conversation_workflows(status) WHERE status IN ('planning', 'active');
CREATE INDEX idx_conversation_workflows_template ON conversation_workflows(template_id);

-- ============================================
-- Workflow Tasks Table
-- ============================================
-- Individual tasks within a workflow
CREATE TABLE IF NOT EXISTS workflow_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES conversation_workflows(id) ON DELETE CASCADE,
  parent_task_id UUID REFERENCES workflow_tasks(id) ON DELETE CASCADE,
  task_type VARCHAR(20) NOT NULL CHECK (task_type IN ('gather', 'validate', 'execute', 'confirm', 'decision', 'notify')),
  title TEXT NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'failed', 'skipped', 'blocked')),
  prerequisites JSONB[] DEFAULT '{}', -- Complex prerequisite conditions
  data_collected JSONB DEFAULT '{}', -- Information gathered by this task
  validation_rules JSONB DEFAULT '{}', -- Rules for validating collected data
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  retry_strategy JSONB DEFAULT '{"type": "exponential_backoff", "initial_delay": 1000}',
  estimated_duration INTERVAL,
  actual_duration INTERVAL,
  scheduled_for TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,
  metadata JSONB DEFAULT '{}', -- Additional task-specific metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for task queries
CREATE INDEX idx_workflow_tasks_workflow ON workflow_tasks(workflow_id);
CREATE INDEX idx_workflow_tasks_parent ON workflow_tasks(parent_task_id);
CREATE INDEX idx_workflow_tasks_status ON workflow_tasks(status) WHERE status IN ('pending', 'active', 'blocked');
CREATE INDEX idx_workflow_tasks_scheduled ON workflow_tasks(scheduled_for) WHERE scheduled_for IS NOT NULL;

-- ============================================
-- Workflow Dependencies Table
-- ============================================
-- Complex dependency relationships between tasks
CREATE TABLE IF NOT EXISTS workflow_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES workflow_tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES workflow_tasks(id) ON DELETE CASCADE,
  dependency_type VARCHAR(20) NOT NULL CHECK (dependency_type IN ('blocks', 'informs', 'optional', 'conditional')),
  condition JSONB DEFAULT '{}', -- Conditional dependency logic
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id, depends_on_task_id)
);

-- Create indexes for dependency queries
CREATE INDEX idx_workflow_dependencies_task ON workflow_dependencies(task_id);
CREATE INDEX idx_workflow_dependencies_depends_on ON workflow_dependencies(depends_on_task_id);

-- ============================================
-- Workflow Executions Log Table
-- ============================================
-- Detailed log of workflow executions for learning and optimization
CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES conversation_workflows(id) ON DELETE CASCADE,
  task_id UUID REFERENCES workflow_tasks(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL, -- 'started', 'completed', 'failed', 'retried', 'skipped', etc.
  actor VARCHAR(50), -- 'system', 'user', 'ai', etc.
  input_data JSONB DEFAULT '{}',
  output_data JSONB DEFAULT '{}',
  error_details JSONB DEFAULT '{}',
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for execution log queries
CREATE INDEX idx_workflow_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX idx_workflow_executions_task ON workflow_executions(task_id);
CREATE INDEX idx_workflow_executions_created ON workflow_executions(created_at DESC);

-- ============================================
-- Workflow Learning Table
-- ============================================
-- Stores learned patterns and optimizations
CREATE TABLE IF NOT EXISTS workflow_learning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES workflow_templates(id) ON DELETE CASCADE,
  pattern_type VARCHAR(50) NOT NULL, -- 'optimization', 'failure_pattern', 'success_pattern', etc.
  pattern_data JSONB NOT NULL,
  confidence_score NUMERIC(5,2) DEFAULT 0, -- 0-100
  occurrence_count INTEGER DEFAULT 1,
  last_observed TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  applied_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for learning queries
CREATE INDEX idx_workflow_learning_template ON workflow_learning(template_id);
CREATE INDEX idx_workflow_learning_pattern_type ON workflow_learning(pattern_type);
CREATE INDEX idx_workflow_learning_confidence ON workflow_learning(confidence_score DESC);

-- ============================================
-- Update conversation_tasks table
-- ============================================
-- Add workflow relationship to existing tasks table
ALTER TABLE conversation_tasks 
ADD COLUMN IF NOT EXISTS workflow_task_id UUID REFERENCES workflow_tasks(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_workflow_generated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS workflow_metadata JSONB DEFAULT '{}';

-- Create index for workflow-related tasks
CREATE INDEX IF NOT EXISTS idx_conversation_tasks_workflow ON conversation_tasks(workflow_task_id) WHERE workflow_task_id IS NOT NULL;

-- ============================================
-- Insert Default Workflow Templates
-- ============================================
-- Meeting Scheduler Template
INSERT INTO workflow_templates (name, category, description, base_structure, required_capabilities)
VALUES (
  'Meeting Scheduler',
  'scheduling',
  'Intelligent workflow for scheduling meetings with automatic information gathering',
  '{
    "steps": [
      {
        "id": "gather_attendees",
        "type": "gather",
        "title": "Collect attendee information",
        "required_data": ["attendee_emails", "attendee_names"],
        "validation": {"email_format": true, "min_attendees": 1}
      },
      {
        "id": "determine_timeframe",
        "type": "gather",
        "title": "Determine meeting timeframe",
        "required_data": ["preferred_date", "duration", "time_constraints"],
        "validation": {"future_date": true, "business_hours": true}
      },
      {
        "id": "check_availability",
        "type": "execute",
        "title": "Check calendar availability",
        "depends_on": ["gather_attendees", "determine_timeframe"],
        "retry_on_failure": true
      },
      {
        "id": "collect_details",
        "type": "gather",
        "title": "Collect meeting details",
        "required_data": ["title", "description", "location_preference"],
        "optional_data": ["agenda_items", "preparation_notes"]
      },
      {
        "id": "confirm_details",
        "type": "confirm",
        "title": "Confirm meeting details with user",
        "depends_on": ["check_availability", "collect_details"]
      },
      {
        "id": "book_meeting",
        "type": "execute",
        "title": "Book the meeting",
        "depends_on": ["confirm_details"],
        "critical": true
      },
      {
        "id": "send_confirmation",
        "type": "notify",
        "title": "Send confirmation to all parties",
        "depends_on": ["book_meeting"]
      }
    ],
    "estimated_duration": "5 minutes",
    "fallback_strategy": "manual_scheduling"
  }',
  ARRAY['schedule_meeting', 'check_availability']
) ON CONFLICT DO NOTHING;

-- Support Ticket Template
INSERT INTO workflow_templates (name, category, description, base_structure, required_capabilities)
VALUES (
  'Support Ticket',
  'support',
  'Workflow for creating and tracking support tickets',
  '{
    "steps": [
      {
        "id": "identify_issue",
        "type": "gather",
        "title": "Identify the issue",
        "required_data": ["issue_description", "issue_category"],
        "prompts": ["What issue are you experiencing?", "When did this start?"]
      },
      {
        "id": "gather_context",
        "type": "gather",
        "title": "Gather context information",
        "required_data": ["environment", "steps_to_reproduce"],
        "optional_data": ["screenshots", "error_messages"]
      },
      {
        "id": "assess_priority",
        "type": "decision",
        "title": "Assess ticket priority",
        "depends_on": ["identify_issue"],
        "rules": {"critical_keywords": ["down", "blocked", "urgent"]}
      },
      {
        "id": "collect_contact",
        "type": "gather",
        "title": "Collect contact information",
        "required_data": ["email", "preferred_contact_method"],
        "skip_if_known": true
      },
      {
        "id": "create_ticket",
        "type": "execute",
        "title": "Create support ticket",
        "depends_on": ["identify_issue", "gather_context", "assess_priority", "collect_contact"],
        "critical": true
      },
      {
        "id": "send_confirmation",
        "type": "notify",
        "title": "Send ticket confirmation",
        "depends_on": ["create_ticket"],
        "includes": ["ticket_number", "expected_response_time"]
      }
    ],
    "estimated_duration": "3 minutes",
    "escalation_path": "priority_queue"
  }',
  ARRAY['create_ticket']
) ON CONFLICT DO NOTHING;

-- ============================================
-- Create helper functions
-- ============================================
-- Function to get next available task in a workflow
CREATE OR REPLACE FUNCTION get_next_workflow_task(p_workflow_id UUID)
RETURNS UUID AS $$
DECLARE
  v_next_task_id UUID;
BEGIN
  SELECT wt.id INTO v_next_task_id
  FROM workflow_tasks wt
  WHERE wt.workflow_id = p_workflow_id
    AND wt.status = 'pending'
    AND NOT EXISTS (
      -- Check if all dependencies are completed
      SELECT 1
      FROM workflow_dependencies wd
      JOIN workflow_tasks dep_task ON dep_task.id = wd.depends_on_task_id
      WHERE wd.task_id = wt.id
        AND wd.dependency_type = 'blocks'
        AND dep_task.status != 'completed'
    )
  ORDER BY wt.created_at
  LIMIT 1;
  
  RETURN v_next_task_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update workflow status based on task statuses
CREATE OR REPLACE FUNCTION update_workflow_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Update parent workflow status when task status changes
  IF NEW.status = 'failed' AND OLD.status != 'failed' THEN
    UPDATE conversation_workflows
    SET status = 'failed',
        failure_reason = 'Task failed: ' || NEW.title,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.workflow_id
      AND status != 'failed';
  ELSIF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Check if all tasks are completed
    IF NOT EXISTS (
      SELECT 1 FROM workflow_tasks
      WHERE workflow_id = NEW.workflow_id
        AND status NOT IN ('completed', 'skipped')
        AND id != NEW.id
    ) THEN
      UPDATE conversation_workflows
      SET status = 'completed',
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.workflow_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for workflow status updates
CREATE TRIGGER update_workflow_status_trigger
AFTER UPDATE OF status ON workflow_tasks
FOR EACH ROW
EXECUTE FUNCTION update_workflow_status();

-- ============================================
-- Create Comments
-- ============================================
COMMENT ON TABLE workflow_templates IS 'Stores reusable workflow templates for common multi-step processes';
COMMENT ON TABLE conversation_workflows IS 'Tracks active workflow instances for specific conversations';
COMMENT ON TABLE workflow_tasks IS 'Individual tasks within a workflow with dependency management';
COMMENT ON TABLE workflow_dependencies IS 'Complex dependency relationships between workflow tasks';
COMMENT ON TABLE workflow_executions IS 'Detailed execution log for workflow learning and optimization';
COMMENT ON TABLE workflow_learning IS 'Stores learned patterns and optimizations from workflow executions';