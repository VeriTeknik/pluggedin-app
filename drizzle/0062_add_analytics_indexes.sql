-- Add composite indexes for analytics performance optimization
-- These indexes will significantly improve query performance for analytics queries

-- Index for general analytics queries filtering by profile, action, and date
CREATE INDEX IF NOT EXISTS idx_mcp_activity_analytics
ON mcp_activity(profile_uuid, action, created_at DESC);

-- Index for document access tracking queries
CREATE INDEX IF NOT EXISTS idx_mcp_activity_document_access
ON mcp_activity(profile_uuid, action, item_name)
WHERE action IN ('document_view', 'document_rag_query', 'document_download');

-- Index for server activity queries
CREATE INDEX IF NOT EXISTS idx_mcp_activity_server_analytics
ON mcp_activity(profile_uuid, server_uuid, created_at DESC)
WHERE server_uuid IS NOT NULL;

-- Add comment documenting the indexes
COMMENT ON INDEX idx_mcp_activity_analytics IS 'Composite index for analytics queries by profile, action, and date';
COMMENT ON INDEX idx_mcp_activity_document_access IS 'Partial index for document access tracking queries';
COMMENT ON INDEX idx_mcp_activity_server_analytics IS 'Partial index for server-specific analytics';