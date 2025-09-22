-- Performance optimization indexes
-- Created to address N+1 query patterns and improve query performance

-- Index for custom_instructions_table
-- Speeds up lookups by mcp_server_uuid (used in batch queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_custom_instructions_server_uuid 
  ON custom_instructions_table(mcp_server_uuid);

-- Composite index for mcp_servers_table
-- Optimizes queries filtering by profile and status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mcp_servers_profile_status 
  ON mcp_servers_table(profile_uuid, status);

-- Index for mcp_servers_table by profile_uuid alone
-- Frequently used in queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mcp_servers_profile 
  ON mcp_servers_table(profile_uuid);

-- Composite index for notifications_table
-- Optimizes queries for unread notifications by user
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_read 
  ON notifications_table(user_id, read, created_at DESC);

-- Index for tools_table
-- Speeds up tool lookups by server UUID
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tools_server_uuid 
  ON tools_table(mcp_server_uuid);

-- Index for resources_table
-- Speeds up resource lookups by server UUID
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resources_server_uuid 
  ON resources_table(mcp_server_uuid);

-- Index for prompts_table
-- Speeds up prompt lookups by server UUID
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prompts_server_uuid 
  ON prompts_table(mcp_server_uuid);

-- Index for resource_templates_table
-- Speeds up template lookups by server UUID
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resource_templates_server_uuid 
  ON resource_templates_table(mcp_server_uuid);

-- Index for codes_table
-- Speeds up code lookups by UUID (used in joins)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codes_uuid 
  ON codes_table(uuid);

-- Index for custom_mcp_servers_table
-- Speeds up lookups by code_uuid (used in joins)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_custom_mcp_servers_code_uuid 
  ON custom_mcp_servers_table(code_uuid);

-- Index for mcp_server_logs_table
-- Optimizes log queries by server and timestamp
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mcp_server_logs_server_timestamp 
  ON mcp_server_logs_table(mcp_server_uuid, timestamp DESC);

-- Index for conversations_table
-- Optimizes conversation lookups by embedded chat
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_embedded_chat 
  ON conversations_table(embedded_chat_uuid, created_at DESC);

-- Index for messages_table
-- Optimizes message queries by conversation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation 
  ON messages_table(conversation_uuid, created_at);

-- Analyze tables after index creation for optimal query planning
ANALYZE custom_instructions_table;
ANALYZE mcp_servers_table;
ANALYZE notifications_table;
ANALYZE tools_table;
ANALYZE resources_table;
ANALYZE prompts_table;
ANALYZE resource_templates_table;
ANALYZE codes_table;
ANALYZE custom_mcp_servers_table;
ANALYZE mcp_server_logs_table;
ANALYZE conversations_table;
ANALYZE messages_table;