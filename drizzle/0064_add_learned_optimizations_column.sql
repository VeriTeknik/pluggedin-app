-- Add missing learned_optimizations column to conversation_workflows table
ALTER TABLE "conversation_workflows" 
ADD COLUMN IF NOT EXISTS "learned_optimizations" jsonb DEFAULT '{}';