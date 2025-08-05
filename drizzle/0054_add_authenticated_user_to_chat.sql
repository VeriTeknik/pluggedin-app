-- Add authenticated user columns to chat_conversations table
ALTER TABLE chat_conversations 
ADD COLUMN IF NOT EXISTS authenticated_user_id text REFERENCES users(id),
ADD COLUMN IF NOT EXISTS authenticated_user_name text,
ADD COLUMN IF NOT EXISTS authenticated_user_avatar text;

-- Create index for authenticated user lookups
CREATE INDEX IF NOT EXISTS idx_conversations_authenticated_user 
ON chat_conversations(authenticated_user_id);

-- Add comment explaining the columns
COMMENT ON COLUMN chat_conversations.authenticated_user_id IS 'The ID of the authenticated user starting the conversation (if logged in)';
COMMENT ON COLUMN chat_conversations.authenticated_user_name IS 'Cached name of the authenticated user for display';
COMMENT ON COLUMN chat_conversations.authenticated_user_avatar IS 'Cached avatar URL of the authenticated user for display';