-- Consolidated workflow system migration
-- This migration combines all workflow-related changes from migrations 0064-0071
-- into a single atomic migration for the embedded chat workflow system

-- 1. Create workflow_templates table with correct column names
CREATE TABLE IF NOT EXISTS workflow_templates (
    id varchar(100) PRIMARY KEY,
    name text NOT NULL,
    description text,
    category varchar(50),
    base_structure jsonb DEFAULT '[]', -- renamed from default_steps
    trigger_patterns jsonb DEFAULT '[]',
    required_capabilities jsonb DEFAULT '[]',
    priority_score numeric(5, 2) DEFAULT '0',
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 2. Create conversation_workflows table with all required columns
CREATE TABLE IF NOT EXISTS conversation_workflows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES chat_conversations(uuid) ON DELETE CASCADE,
    template_id varchar(100) REFERENCES workflow_templates(id),
    status varchar(20) DEFAULT 'planning' NOT NULL,
    context jsonb DEFAULT '{}',
    learned_optimizations jsonb DEFAULT '{}', -- from migration 0064
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

-- 4. Create workflow_dependencies table with condition column
CREATE TABLE IF NOT EXISTS workflow_dependencies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id uuid NOT NULL REFERENCES workflow_tasks(id) ON DELETE CASCADE,
    depends_on_task_id uuid NOT NULL REFERENCES workflow_tasks(id) ON DELETE CASCADE,
    dependency_type varchar(20) DEFAULT 'required',
    condition jsonb DEFAULT '{}', -- from migration 0071
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
    template_id varchar(100) REFERENCES workflow_templates(id) ON DELETE CASCADE,
    pattern_type varchar(50) NOT NULL,
    pattern_data jsonb NOT NULL,
    confidence_score numeric(5, 2) DEFAULT '0',
    occurrence_count integer DEFAULT 1,
    last_observed timestamp with time zone DEFAULT now() NOT NULL,
    applied_count integer DEFAULT 0,
    success_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 7. Add workflow columns to conversation_tasks table (from migration 0065)
ALTER TABLE conversation_tasks 
ADD COLUMN IF NOT EXISTS workflow_task_id uuid REFERENCES workflow_tasks(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_workflow_generated boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS workflow_metadata jsonb DEFAULT '{}';

-- 8. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversation_workflows_conversation ON conversation_workflows(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_workflows_template ON conversation_workflows(template_id);
CREATE INDEX IF NOT EXISTS idx_conversation_workflows_status ON conversation_workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_workflow ON workflow_tasks(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_parent ON workflow_tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_status ON workflow_tasks(status);
CREATE INDEX IF NOT EXISTS idx_workflow_dependencies_task ON workflow_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_workflow_dependencies_depends_on ON workflow_dependencies(depends_on_task_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_task ON workflow_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_workflow_learning_template ON workflow_learning(template_id);
CREATE INDEX IF NOT EXISTS idx_conversation_tasks_workflow_task ON conversation_tasks(workflow_task_id);

-- 9. Insert initial workflow templates (from migrations 0069 and 0070)
-- Scheduling workflow with availability checking
INSERT INTO workflow_templates (id, name, description, category, base_structure, trigger_patterns, required_capabilities, priority_score, enabled)
VALUES (
    'scheduling_with_availability',
    'Smart Scheduling with Availability',
    'Intelligently schedules meetings by checking calendar availability and handling conflicts',
    'scheduling',
    '[
        {
            "task_type": "discovery",
            "title": "Understand scheduling request",
            "description": "Parse meeting details from user message",
            "data_requirements": ["meeting_type", "duration", "participants", "preferences"]
        },
        {
            "task_type": "data_collection",
            "title": "Check calendar availability",
            "description": "Check availability for all participants",
            "prerequisites": ["discovery"],
            "data_requirements": ["calendar_access", "time_zones"]
        },
        {
            "task_type": "planning",
            "title": "Find optimal time slots",
            "description": "Identify best meeting times based on availability",
            "prerequisites": ["data_collection"],
            "validation_rules": {
                "min_slots": 3,
                "respect_working_hours": true,
                "avoid_conflicts": true
            }
        },
        {
            "task_type": "confirmation",
            "title": "Confirm with participants",
            "description": "Get confirmation from all participants",
            "prerequisites": ["planning"],
            "data_requirements": ["participant_responses"]
        },
        {
            "task_type": "implementation",
            "title": "Create calendar event",
            "description": "Add the meeting to all calendars",
            "prerequisites": ["confirmation"],
            "retry_strategy": {
                "type": "exponential_backoff",
                "max_retries": 3
            }
        },
        {
            "task_type": "follow_up",
            "title": "Send confirmations",
            "description": "Send calendar invites and confirmation emails",
            "prerequisites": ["implementation"]
        }
    ]'::jsonb,
    '[
        "schedule.*meeting",
        "book.*time",
        "set up.*call",
        "arrange.*appointment",
        "find.*slot",
        "check.*availability",
        "coordinate.*schedules"
    ]'::jsonb,
    '["calendar_integration", "email_sending", "timezone_handling"]'::jsonb,
    95.00,
    true
) ON CONFLICT (id) DO NOTHING;

-- Research workflow
INSERT INTO workflow_templates (id, name, description, category, base_structure, trigger_patterns, required_capabilities, priority_score, enabled)
VALUES (
    'research_workflow',
    'Research and Information Gathering',
    'Comprehensive research workflow for gathering and synthesizing information',
    'research',
    '[
        {
            "task_type": "discovery",
            "title": "Define research scope",
            "description": "Understand what information is needed"
        },
        {
            "task_type": "data_collection",
            "title": "Gather information",
            "description": "Collect data from various sources",
            "prerequisites": ["discovery"]
        },
        {
            "task_type": "planning",
            "title": "Synthesize findings",
            "description": "Analyze and organize collected information",
            "prerequisites": ["data_collection"]
        },
        {
            "task_type": "implementation",
            "title": "Create summary",
            "description": "Prepare comprehensive research summary",
            "prerequisites": ["planning"]
        }
    ]'::jsonb,
    '[
        "research.*about",
        "find.*information",
        "look up",
        "investigate",
        "gather.*data"
    ]'::jsonb,
    '["web_search", "document_analysis"]'::jsonb,
    80.00,
    true
) ON CONFLICT (id) DO NOTHING;

-- Purchase workflow
INSERT INTO workflow_templates (id, name, description, category, base_structure, trigger_patterns, required_capabilities, priority_score, enabled)
VALUES (
    'purchase_workflow',
    'Purchase Decision Support',
    'Helps users make informed purchase decisions',
    'commerce',
    '[
        {
            "task_type": "discovery",
            "title": "Understand purchase needs",
            "description": "Identify requirements and preferences"
        },
        {
            "task_type": "data_collection",
            "title": "Research options",
            "description": "Find and compare available products",
            "prerequisites": ["discovery"]
        },
        {
            "task_type": "planning",
            "title": "Analyze and compare",
            "description": "Compare features, prices, and reviews",
            "prerequisites": ["data_collection"]
        },
        {
            "task_type": "recommendation",
            "title": "Provide recommendations",
            "description": "Suggest best options based on criteria",
            "prerequisites": ["planning"]
        }
    ]'::jsonb,
    '[
        "help.*buy",
        "purchase",
        "shop.*for",
        "recommend.*product",
        "compare.*prices"
    ]'::jsonb,
    '["product_search", "price_comparison"]'::jsonb,
    75.00,
    true
) ON CONFLICT (id) DO NOTHING;