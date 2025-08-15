-- Create all workflow-related tables that are missing
-- This is a complete setup for the workflow system

-- 1. Create workflow_templates table
CREATE TABLE IF NOT EXISTS workflow_templates (
    id varchar(100) PRIMARY KEY,
    name text NOT NULL,
    description text,
    category varchar(50),
    default_steps jsonb DEFAULT '[]',
    trigger_patterns jsonb DEFAULT '[]',
    required_capabilities jsonb DEFAULT '[]',
    priority_score numeric(5, 2) DEFAULT '0',
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 2. Create conversation_workflows table with all columns
CREATE TABLE IF NOT EXISTS conversation_workflows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES chat_conversations(uuid) ON DELETE CASCADE,
    template_id varchar(100) REFERENCES workflow_templates(id),
    status varchar(20) DEFAULT 'planning' NOT NULL,
    context jsonb DEFAULT '{}',
    learned_optimizations jsonb DEFAULT '{}',
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    failure_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 3. Create workflow_tasks table
CREATE TABLE IF NOT EXISTS workflow_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id uuid NOT NULL REFERENCES conversation_workflows(id) ON DELETE CASCADE,
    parent_task_id uuid REFERENCES workflow_tasks(id) ON DELETE CASCADE,
    task_type varchar(20) NOT NULL,
    title text NOT NULL,
    description text,
    status varchar(20) DEFAULT 'pending' NOT NULL,
    prerequisites jsonb DEFAULT '[]',
    data_collected jsonb DEFAULT '{}',
    validation_rules jsonb DEFAULT '{}',
    retry_count integer DEFAULT 0,
    max_retries integer DEFAULT 3,
    retry_strategy jsonb DEFAULT '{"type": "exponential_backoff", "initial_delay": 1000}',
    estimated_duration interval,
    actual_duration interval,
    scheduled_for timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    failed_at timestamp with time zone,
    failure_reason text,
    metadata jsonb DEFAULT '{}',
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 4. Create workflow_dependencies table
CREATE TABLE IF NOT EXISTS workflow_dependencies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id uuid NOT NULL REFERENCES workflow_tasks(id) ON DELETE CASCADE,
    depends_on_task_id uuid NOT NULL REFERENCES workflow_tasks(id) ON DELETE CASCADE,
    dependency_type varchar(20) DEFAULT 'required',
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 5. Create workflow_executions table
CREATE TABLE IF NOT EXISTS workflow_executions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id uuid NOT NULL REFERENCES conversation_workflows(id) ON DELETE CASCADE,
    task_id uuid REFERENCES workflow_tasks(id) ON DELETE CASCADE,
    action varchar(50) NOT NULL,
    actor varchar(50),
    input_data jsonb DEFAULT '{}',
    output_data jsonb DEFAULT '{}',
    error_details jsonb DEFAULT '{}',
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 6. Create workflow_learning table
CREATE TABLE IF NOT EXISTS workflow_learning (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id uuid REFERENCES workflow_templates(id) ON DELETE CASCADE,
    pattern_type varchar(50) NOT NULL,
    pattern_data jsonb NOT NULL,
    confidence_score numeric(5, 2) DEFAULT '0',
    occurrence_count integer DEFAULT 1,
    last_observed timestamp with time zone DEFAULT now() NOT NULL,
    applied_count integer DEFAULT 0,
    success_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 7. Add columns to conversation_tasks if they don't exist
DO $$ 
BEGIN
    -- Add workflow_task_id if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversation_tasks' 
        AND column_name = 'workflow_task_id'
    ) THEN
        ALTER TABLE conversation_tasks 
        ADD COLUMN workflow_task_id uuid REFERENCES workflow_tasks(id) ON DELETE SET NULL;
    END IF;
    
    -- Add is_workflow_generated if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversation_tasks' 
        AND column_name = 'is_workflow_generated'
    ) THEN
        ALTER TABLE conversation_tasks 
        ADD COLUMN is_workflow_generated boolean DEFAULT false;
    END IF;
    
    -- Add workflow_metadata if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversation_tasks' 
        AND column_name = 'workflow_metadata'
    ) THEN
        ALTER TABLE conversation_tasks 
        ADD COLUMN workflow_metadata jsonb DEFAULT '{}';
    END IF;
END $$;

-- 8. Create indexes
CREATE INDEX IF NOT EXISTS idx_workflow_templates_category ON workflow_templates(category);
CREATE INDEX IF NOT EXISTS idx_conversation_workflows_conversation ON conversation_workflows(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_workflows_status ON conversation_workflows(status);
CREATE INDEX IF NOT EXISTS idx_conversation_workflows_template ON conversation_workflows(template_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_workflow ON workflow_tasks(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_parent ON workflow_tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_status ON workflow_tasks(status);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_type ON workflow_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_workflow_dependencies_task ON workflow_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_workflow_dependencies_depends_on ON workflow_dependencies(depends_on_task_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_task ON workflow_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_created ON workflow_executions(created_at);
CREATE INDEX IF NOT EXISTS idx_workflow_learning_template ON workflow_learning(template_id);
CREATE INDEX IF NOT EXISTS idx_workflow_learning_pattern ON workflow_learning(pattern_type);
CREATE INDEX IF NOT EXISTS idx_workflow_learning_observed ON workflow_learning(last_observed);

-- 9. Insert default workflow templates
INSERT INTO workflow_templates (id, name, description, category, default_steps, trigger_patterns, required_capabilities, priority_score, enabled)
VALUES 
    ('meeting_scheduler', 'Schedule Meeting', 'Schedule a meeting with attendees', 'scheduling', 
     '[{"type": "gather", "title": "Collect meeting details"}, {"type": "validate", "title": "Check availability"}, {"type": "execute", "title": "Book meeting"}, {"type": "notify", "title": "Send invitations"}]'::jsonb,
     '["schedule", "meeting", "appointment", "calendar", "book"]'::jsonb,
     '["schedule_meeting", "check_availability"]'::jsonb,
     90, true),
    
    ('lead_capture', 'Capture Lead', 'Capture and qualify a new lead', 'sales', 
     '[{"type": "gather", "title": "Collect lead information"}, {"type": "validate", "title": "Qualify lead"}, {"type": "execute", "title": "Create CRM record"}, {"type": "notify", "title": "Alert sales team"}]'::jsonb,
     '["lead", "contact", "interested", "demo", "trial"]'::jsonb,
     '["create_lead"]'::jsonb,
     85, true),
    
    ('support_ticket', 'Create Support Ticket', 'Create and route support tickets', 'support',
     '[{"type": "gather", "title": "Collect issue details"}, {"type": "validate", "title": "Categorize issue"}, {"type": "execute", "title": "Create ticket"}, {"type": "notify", "title": "Assign to agent"}]'::jsonb,
     '["help", "issue", "problem", "support", "ticket", "bug"]'::jsonb,
     '["create_ticket"]'::jsonb,
     80, true)
ON CONFLICT (id) DO NOTHING;

-- 10. Verify tables were created
SELECT 
    table_name,
    COUNT(*) as column_count
FROM information_schema.columns 
WHERE table_name IN (
    'workflow_templates',
    'conversation_workflows', 
    'workflow_tasks',
    'workflow_dependencies',
    'workflow_executions',
    'workflow_learning'
)
GROUP BY table_name
ORDER BY table_name;