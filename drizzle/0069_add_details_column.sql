-- Add missing details column to system_logs table
ALTER TABLE system_logs 
ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb;