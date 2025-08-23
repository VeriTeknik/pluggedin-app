-- Ensure all required columns exist in conversation_memories table
ALTER TABLE conversation_memories 
ADD COLUMN IF NOT EXISTS pii BOOLEAN DEFAULT false;

ALTER TABLE conversation_memories 
ADD COLUMN IF NOT EXISTS consent TEXT DEFAULT 'implicit';

ALTER TABLE conversation_memories 
ADD COLUMN IF NOT EXISTS source VARCHAR(64) DEFAULT 'user';

ALTER TABLE conversation_memories 
ADD COLUMN IF NOT EXISTS source_ref TEXT;

-- Ensure all required columns exist in system_logs table  
ALTER TABLE system_logs
ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb;

-- Ensure all required columns exist in workflow_templates table
ALTER TABLE workflow_templates
ADD COLUMN IF NOT EXISTS success_rate REAL DEFAULT 0;

ALTER TABLE workflow_templates
ADD COLUMN IF NOT EXISTS average_completion_time INTEGER;

ALTER TABLE workflow_templates
ADD COLUMN IF NOT EXISTS optimization_history JSONB DEFAULT '[]'::jsonb;