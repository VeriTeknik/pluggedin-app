-- Drop the foreign key constraint on audit_logs.server_uuid
-- This allows audit logs to persist even after servers are deleted
-- which is important for maintaining a complete audit trail

ALTER TABLE "audit_logs"
DROP CONSTRAINT IF EXISTS "audit_logs_server_uuid_mcp_servers_uuid_fk";

-- Keep the column and index for query performance
-- The server_uuid can now reference deleted servers