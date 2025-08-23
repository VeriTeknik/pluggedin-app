-- Fix conversation_memories table to match application schema
ALTER TABLE conversation_memories 
ADD COLUMN IF NOT EXISTS source_ref TEXT,
ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Update consent column type if needed (app expects text, db has jsonb)
-- We'll keep the existing jsonb for now and handle in code

-- Fix system_logs table to match application schema
ALTER TABLE system_logs
ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Ensure workflow_templates has all required columns
ALTER TABLE workflow_templates
ADD COLUMN IF NOT EXISTS success_rate REAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS average_completion_time INTEGER,
ADD COLUMN IF NOT EXISTS optimization_history JSONB DEFAULT '[]'::jsonb;