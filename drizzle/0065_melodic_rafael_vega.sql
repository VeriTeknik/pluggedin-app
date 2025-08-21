-- Create workflow tables if they don't exist
-- This migration ensures workflow tables exist before attempting to alter them

-- Enable pgvector extension if not already enabled (needed for vector embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Create workflow_templates table if not exists
CREATE TABLE IF NOT EXISTS workflow_templates (
    id varchar(100) PRIMARY KEY,
    name text NOT NULL,
    description text,
    category varchar(50),
    base_structure jsonb DEFAULT '[]',
    trigger_patterns jsonb DEFAULT '[]',
    required_capabilities jsonb DEFAULT '[]',
    priority_score numeric(5, 2) DEFAULT '0',
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 2. Create conversation_workflows table if not exists
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

-- 3. Create workflow_tasks table if not exists
CREATE TABLE IF NOT EXISTS workflow_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id uuid NOT NULL REFERENCES conversation_workflows(id) ON DELETE CASCADE,
    parent_task_id uuid,
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
    priority integer DEFAULT 0,
    error_message text,
    output jsonb DEFAULT '{}',
    metadata jsonb DEFAULT '{}',
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    failed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 4. Create workflow_dependencies table if not exists
CREATE TABLE IF NOT EXISTS workflow_dependencies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id uuid NOT NULL REFERENCES workflow_tasks(id) ON DELETE CASCADE,
    depends_on_task_id uuid NOT NULL REFERENCES workflow_tasks(id) ON DELETE CASCADE,
    dependency_type varchar(20) DEFAULT 'completion',
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 5. Create workflow_executions table if not exists
CREATE TABLE IF NOT EXISTS workflow_executions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id uuid NOT NULL REFERENCES conversation_workflows(id) ON DELETE CASCADE,
    task_id uuid NOT NULL REFERENCES workflow_tasks(id) ON DELETE CASCADE,
    attempt_number integer DEFAULT 1,
    status varchar(20) NOT NULL,
    error text,
    result jsonb DEFAULT '{}',
    duration interval,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 6. Create workflow_learning table if not exists
CREATE TABLE IF NOT EXISTS workflow_learning (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id varchar(100) REFERENCES workflow_templates(id),
    pattern_type varchar(50) NOT NULL,
    pattern_data jsonb NOT NULL,
    confidence_score numeric(5, 2),
    occurrence_count integer DEFAULT 1,
    success_count integer DEFAULT 0,
    last_observed timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}',
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 7. Create conversation_memories table if not exists
CREATE TABLE IF NOT EXISTS conversation_memories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES chat_conversations(uuid) ON DELETE CASCADE,
    owner_id uuid NOT NULL,
    kind text NOT NULL,
    key text,
    value_jsonb jsonb NOT NULL,
    language_code text,
    salience real DEFAULT 0 NOT NULL,
    novelty_hash text,
    links jsonb DEFAULT '[]',
    consent jsonb DEFAULT '{}',
    metadata jsonb DEFAULT '{}',
    vector_embedding vector(1536),
    expiry_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ttl_days integer DEFAULT 90
);

-- 8. Create conversation_tasks table if not exists
CREATE TABLE IF NOT EXISTS conversation_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES chat_conversations(uuid) ON DELETE CASCADE,
    workflow_id uuid REFERENCES conversation_workflows(id) ON DELETE CASCADE,
    task_type varchar(50) NOT NULL,
    description text,
    status varchar(20) DEFAULT 'pending' NOT NULL,
    priority integer DEFAULT 0,
    assigned_to text,
    result jsonb DEFAULT '{}',
    error text,
    scheduled_for timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_conversation_workflows_conversation_id ON conversation_workflows(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_workflows_status ON conversation_workflows(status);
CREATE INDEX IF NOT EXISTS idx_conversation_workflows_template_id ON conversation_workflows(template_id);

CREATE INDEX IF NOT EXISTS idx_workflow_tasks_workflow_id ON workflow_tasks(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_status ON workflow_tasks(status);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_parent_task_id ON workflow_tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_task_type ON workflow_tasks(task_type);

CREATE INDEX IF NOT EXISTS idx_workflow_dependencies_task_id ON workflow_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_workflow_dependencies_depends_on_task_id ON workflow_dependencies(depends_on_task_id);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_task_id ON workflow_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);

CREATE INDEX IF NOT EXISTS idx_workflow_learning_template_id ON workflow_learning(template_id);
CREATE INDEX IF NOT EXISTS idx_workflow_learning_pattern_type ON workflow_learning(pattern_type);
CREATE INDEX IF NOT EXISTS idx_workflow_learning_confidence ON workflow_learning(confidence_score);

CREATE INDEX IF NOT EXISTS idx_conversation_memories_conversation_id ON conversation_memories(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_memories_kind ON conversation_memories(kind);
CREATE INDEX IF NOT EXISTS idx_conversation_memories_key ON conversation_memories(key);
CREATE INDEX IF NOT EXISTS idx_conversation_memories_owner_id ON conversation_memories(owner_id);
CREATE INDEX IF NOT EXISTS idx_conversation_memories_expiry ON conversation_memories(expiry_at);

CREATE INDEX IF NOT EXISTS idx_conversation_tasks_conversation_id ON conversation_tasks(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_tasks_workflow_id ON conversation_tasks(workflow_id);
CREATE INDEX IF NOT EXISTS idx_conversation_tasks_status ON conversation_tasks(status);
CREATE INDEX IF NOT EXISTS idx_conversation_tasks_task_type ON conversation_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_conversation_tasks_scheduled_for ON conversation_tasks(scheduled_for);

-- Now apply the alterations from 0064_icy_bedlam and 0065_black_vermin
-- Only if the tables exist (which they should now)
DO $$ 
BEGIN
    -- Check if workflow_tasks table exists and has the prerequisites column
    IF EXISTS (SELECT FROM information_schema.columns 
               WHERE table_name = 'workflow_tasks' 
               AND column_name = 'prerequisites') THEN
        -- Alter the prerequisites column to jsonb if it's not already
        ALTER TABLE workflow_tasks ALTER COLUMN prerequisites SET DATA TYPE jsonb USING prerequisites::jsonb;
        ALTER TABLE workflow_tasks ALTER COLUMN prerequisites SET DEFAULT '[]'::jsonb;
    END IF;
    
    -- Check if workflow_dependencies has condition column and drop it
    IF EXISTS (SELECT FROM information_schema.columns 
               WHERE table_name = 'workflow_dependencies' 
               AND column_name = 'condition') THEN
        ALTER TABLE workflow_dependencies DROP COLUMN condition;
    END IF;
    
    -- Drop the parent_task_id foreign key constraint if it exists
    IF EXISTS (SELECT FROM information_schema.table_constraints 
               WHERE constraint_name = 'workflow_tasks_parent_task_id_workflow_tasks_id_fk'
               AND table_name = 'workflow_tasks') THEN
        ALTER TABLE workflow_tasks DROP CONSTRAINT workflow_tasks_parent_task_id_workflow_tasks_id_fk;
    END IF;
END $$;