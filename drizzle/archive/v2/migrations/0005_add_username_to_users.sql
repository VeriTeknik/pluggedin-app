-- Add username column to users table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'username'
    ) THEN
        ALTER TABLE users ADD COLUMN username TEXT;
        ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);
        CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);
    END IF;
END $$;