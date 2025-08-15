-- Add missing condition column to workflow_dependencies table
ALTER TABLE workflow_dependencies 
ADD COLUMN IF NOT EXISTS condition jsonb DEFAULT '{}';