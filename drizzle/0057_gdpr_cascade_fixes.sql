-- GDPR Compliance: Ensure all user data is deleted when account is deleted
-- This migration changes SET NULL to CASCADE for complete data deletion

-- Fix shared_mcp_servers table
-- When a user who claimed a server is deleted, delete the shared server entry
ALTER TABLE shared_mcp_servers 
  DROP CONSTRAINT IF EXISTS shared_mcp_servers_claimed_by_user_id_fkey;

ALTER TABLE shared_mcp_servers 
  ADD CONSTRAINT shared_mcp_servers_claimed_by_user_id_fkey 
    FOREIGN KEY (claimed_by_user_id) 
    REFERENCES users(id) 
    ON DELETE CASCADE;

-- Fix registry_servers table
-- When a user who claimed a registry server is deleted, delete the registry entry
ALTER TABLE registry_servers 
  DROP CONSTRAINT IF EXISTS registry_servers_claimed_by_user_id_fkey;

ALTER TABLE registry_servers 
  ADD CONSTRAINT registry_servers_claimed_by_user_id_fkey 
    FOREIGN KEY (claimed_by_user_id) 
    REFERENCES users(id) 
    ON DELETE CASCADE;

-- Add comment explaining GDPR compliance
COMMENT ON CONSTRAINT shared_mcp_servers_claimed_by_user_id_fkey ON shared_mcp_servers IS 
  'GDPR Compliance: Cascades deletion to ensure complete data removal when user account is deleted';

COMMENT ON CONSTRAINT registry_servers_claimed_by_user_id_fkey ON registry_servers IS 
  'GDPR Compliance: Cascades deletion to ensure complete data removal when user account is deleted';

-- Note: With these changes, when a user account is deleted:
-- 1. All their projects, profiles, and MCP servers are deleted (already cascading)
-- 2. All their shared MCP servers are deleted (fixed in this migration)
-- 3. All their claimed registry servers are deleted (fixed in this migration)
-- 4. All their documents, notifications, and email data are deleted (already cascading)
-- This ensures full GDPR "right to be forgotten" compliance