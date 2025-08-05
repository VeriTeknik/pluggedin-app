-- AI Assistants Enhancements: Add description fields for embedded chats and user AI assistants

-- Add description field to embedded_chats table for individual assistant descriptions
ALTER TABLE embedded_chats 
ADD COLUMN IF NOT EXISTS description text;

-- Add index on slug for performance when accessing assistants via /to/username/slug
CREATE INDEX IF NOT EXISTS idx_embedded_chats_slug ON embedded_chats(slug);

-- Add AI assistants description field to users table for general description
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS ai_assistants_description text;

-- Add comment for documentation
COMMENT ON COLUMN embedded_chats.description IS 'Description of the individual AI assistant shown on profile pages';
COMMENT ON COLUMN users.ai_assistants_description IS 'General description about user AI assistants shown on profile';