-- Add username column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Create index for username lookups
CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);

-- Update existing users to have a username based on their email (temporary)
-- This ensures existing users can still function while they choose a username
UPDATE users 
SET username = LOWER(SPLIT_PART(email, '@', 1) || '_' || SUBSTRING(id, 1, 8))
WHERE username IS NULL;