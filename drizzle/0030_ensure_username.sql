-- Ensure username column exists with proper constraints
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS username text;

-- Add unique constraint if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_username_key'
  ) THEN
    ALTER TABLE users 
      ADD CONSTRAINT users_username_key UNIQUE (username);
  END IF;
END $$;

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);

-- Update any existing users with null usernames to have a default based on their email
UPDATE users 
SET username = LOWER(REGEXP_REPLACE(email, '[^a-zA-Z0-9]', '_'))
WHERE username IS NULL AND email IS NOT NULL; 