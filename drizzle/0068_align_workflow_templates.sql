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

-- Change required_capabilities from jsonb to text array
ALTER TABLE workflow_templates 
  ALTER COLUMN required_capabilities TYPE text[] 
  USING CASE 
    WHEN required_capabilities IS NULL THEN NULL
    WHEN jsonb_typeof(required_capabilities) = 'array' THEN 
      ARRAY(SELECT jsonb_array_elements_text(required_capabilities))
    ELSE NULL
  END;

-- Update the existing data to ensure base_structure has the correct format
UPDATE workflow_templates 
SET base_structure = default_steps 
WHERE base_structure IS NULL 
  AND default_steps IS NOT NULL;