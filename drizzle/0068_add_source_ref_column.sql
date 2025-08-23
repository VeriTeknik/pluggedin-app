-- Add missing source_ref column to conversation_memories table
ALTER TABLE conversation_memories 
ADD COLUMN IF NOT EXISTS source_ref VARCHAR(255);