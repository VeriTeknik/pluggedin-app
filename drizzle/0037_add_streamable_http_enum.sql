-- Add STREAMABLE_HTTP to mcp_server_type enum
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'mcp_server_type'
        AND e.enumlabel = 'STREAMABLE_HTTP'
    ) THEN
        ALTER TYPE "mcp_server_type" ADD VALUE 'STREAMABLE_HTTP';
    END IF;
END $$;

-- Add columns for streamable HTTP options to mcp_servers table (optional, for future use)
-- Note: These are stored in the existing 'env' JSONB column for now