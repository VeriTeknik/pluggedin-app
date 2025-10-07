-- Dashboard Performance Indexes
-- Created: 2025-01-06
-- Purpose: Add composite indexes for dashboard analytics queries

-- IMPORTANT: Uses CONCURRENTLY to avoid table locks in production
-- Ensure you have the necessary privileges to create concurrent indexes

-- Composite index for recent documents query pattern
-- Optimizes: WHERE profile_uuid = ? ORDER BY created_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_docs_profile_created_desc
ON docs (profile_uuid, created_at DESC);

-- Analytics-specific index for tool calls
-- Optimizes: WHERE profile_uuid = ? AND action = 'tool_call' ORDER BY created_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mcp_activity_analytics
ON mcp_activity (profile_uuid, action, created_at DESC)
WHERE action IN ('tool_call', 'resource_read', 'prompt_get');

-- Documents analytics index with source
-- Optimizes: WHERE profile_uuid = ? ORDER BY created_at DESC with source filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_docs_analytics
ON docs (profile_uuid, source, created_at DESC);

-- Analyze tables after index creation for optimal query planning
ANALYZE docs;
ANALYZE mcp_activity;