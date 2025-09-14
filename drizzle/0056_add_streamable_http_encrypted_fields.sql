-- Add encrypted columns for transport and streamableHTTPOptions
ALTER TABLE "mcp_servers" 
ADD COLUMN IF NOT EXISTS "transport_encrypted" text,
ADD COLUMN IF NOT EXISTS "streamable_http_options_encrypted" text;

-- Add indexes for the new columns (optional, for query performance if needed)
CREATE INDEX IF NOT EXISTS "mcp_servers_transport_encrypted_idx" ON "mcp_servers" ("transport_encrypted");