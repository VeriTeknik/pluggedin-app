-- Align workflow_templates table with schema definition
-- Rename columns to match the schema
ALTER TABLE workflow_templates 
  RENAME COLUMN default_steps TO base_structure;

ALTER TABLE workflow_templates 
  RENAME COLUMN trigger_patterns TO optimization_history;

ALTER TABLE workflow_templates 
  RENAME COLUMN priority_score TO success_rate;

ALTER TABLE workflow_templates 
  RENAME COLUMN enabled TO is_active;

-- Add missing columns
ALTER TABLE workflow_templates 
  ADD COLUMN IF NOT EXISTS average_completion_time interval;

ALTER TABLE workflow_templates 
  ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;

-- First, create a temporary column for the text array
ALTER TABLE workflow_templates 
  ADD COLUMN IF NOT EXISTS required_capabilities_new text[];

-- Copy the data from jsonb to text array
UPDATE workflow_templates 
SET required_capabilities_new = 
  CASE 
    WHEN required_capabilities IS NULL THEN NULL
    WHEN jsonb_typeof(required_capabilities) = 'array' THEN 
      (SELECT array_agg(value::text) FROM jsonb_array_elements_text(required_capabilities))
    ELSE NULL
  END;

-- Drop the old column and rename the new one
ALTER TABLE workflow_templates DROP COLUMN required_capabilities;
ALTER TABLE workflow_templates RENAME COLUMN required_capabilities_new TO required_capabilities;