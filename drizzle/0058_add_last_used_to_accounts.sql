-- Add last_used column to accounts table to track when each OAuth provider was last used for login
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_used TIMESTAMP WITH TIME ZONE;

-- Create an index for faster queries when displaying connected accounts
CREATE INDEX IF NOT EXISTS idx_accounts_last_used ON accounts(user_id, last_used DESC);