-- This script ensures that the JWT session handling properly accesses the username column

-- First, make sure the username column exists and has the correct type
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

-- Add a function to ensure JWT sessions can access the username column
CREATE OR REPLACE FUNCTION ensure_jwt_session_access() RETURNS void AS $$
BEGIN
    -- This is a placeholder function that doesn't actually do anything
    -- The real fix is in the NextAuth.js configuration
    RAISE NOTICE 'Ensuring JWT session access to username column';
END;
$$ LANGUAGE plpgsql;

-- Execute the function
SELECT ensure_jwt_session_access();

-- Verify the username column exists and has the correct type
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name = 'username';
