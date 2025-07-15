-- Set DateStyle to ensure consistent handling
SET DateStyle = 'ISO, DMY';

-- Clear any existing expires_at values since we don't need them
UPDATE accounts SET expires_at = NULL;

-- Ensure the column is optional
ALTER TABLE accounts ALTER COLUMN expires_at DROP NOT NULL;
