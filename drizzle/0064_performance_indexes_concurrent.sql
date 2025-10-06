-- Performance optimization indexes for analytics queries (CONCURRENT VERSION)
-- These indexes are built concurrently to avoid locking writes on production tables
--
-- ⚠️  IMPORTANT: CONCURRENTLY cannot be used inside a transaction block
--
-- MANUAL EXECUTION REQUIRED:
-- Run this migration manually outside of normal Drizzle migration flow:
--
--   psql $DATABASE_URL -f drizzle/0064_performance_indexes_concurrent.sql
--
-- OR run each CREATE INDEX statement separately to monitor progress:
--
--   psql $DATABASE_URL -c "CREATE INDEX CONCURRENTLY ..."
--
-- PRODUCTION CHECKLIST:
-- 1. Verify migration 0063 has been marked as completed in your database
-- 2. Run this migration during low-traffic period (though CONCURRENTLY is non-blocking)
-- 3. Monitor index creation progress with: SELECT * FROM pg_stat_progress_create_index;
-- 4. Each index may take several minutes on large tables
-- 5. Mark this migration as completed manually in drizzle.__drizzle_migrations table
--
-- NOTE: If migration 0063 was already run (created non-concurrent indexes),
-- these statements will fail with "relation already exists" - that's OK.
-- The IF NOT EXISTS clause handles this gracefully.

-- 1. Composite index for tool combinations query (CRITICAL)
-- Supports the CTE-based query that finds sequential tool pairs
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mcp_activity_tool_combinations
ON mcp_activity(profile_uuid, action, created_at DESC)
WHERE action = 'tool_call';

-- 2. Index for document access tracking by UUID (HIGH PRIORITY)
-- Supports JOIN between mcp_activity.item_name and docs.uuid
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mcp_activity_item_name
ON mcp_activity(item_name)
WHERE action IN ('document_view', 'document_rag_query', 'document_download');

-- 3. Index for daily activity aggregation (HIGH PRIORITY)
-- Supports GROUP BY DATE queries for charts
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mcp_activity_daily_stats
ON mcp_activity(profile_uuid, created_at DESC, action);

-- 4. Index for document library queries (MEDIUM PRIORITY)
-- Supports filtering documents by profile and date range
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_docs_profile_created
ON docs(profile_uuid, created_at DESC);

-- 5. Index for document source filtering (MEDIUM PRIORITY)
-- Supports filtering by AI-generated vs uploaded documents
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_docs_source
ON docs(profile_uuid, source)
WHERE source IN ('ai_generated', 'upload');

-- 6. Index for server activity with external_id fallback (MEDIUM PRIORITY)
-- Supports server name resolution for activity logs
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mcp_activity_external_id
ON mcp_activity(profile_uuid, external_id)
WHERE external_id IS NOT NULL;

-- 7. Index for achievement calculations (LOW PRIORITY)
-- Supports counting lifetime stats efficiently
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mcp_activity_lifetime_stats
ON mcp_activity(profile_uuid, action)
WHERE action IN ('tool_call', 'document_view');

-- Add comments to document the purpose of each index
COMMENT ON INDEX idx_mcp_activity_tool_combinations IS 'Optimizes tool combinations analytics with window functions (built concurrently)';
COMMENT ON INDEX idx_mcp_activity_item_name IS 'Optimizes document access tracking by UUID (built concurrently)';
COMMENT ON INDEX idx_mcp_activity_daily_stats IS 'Optimizes daily activity aggregation queries (built concurrently)';
COMMENT ON INDEX idx_docs_profile_created IS 'Optimizes document library queries by profile and date (built concurrently)';
COMMENT ON INDEX idx_docs_source IS 'Optimizes document source filtering queries (built concurrently)';
COMMENT ON INDEX idx_mcp_activity_external_id IS 'Optimizes external server activity queries (built concurrently)';
COMMENT ON INDEX idx_mcp_activity_lifetime_stats IS 'Optimizes lifetime achievement calculations (built concurrently)';

-- Analyze tables after index creation to update statistics for query planner
-- These should be run after all indexes are built
ANALYZE mcp_activity;
ANALYZE docs;
ANALYZE mcp_servers;