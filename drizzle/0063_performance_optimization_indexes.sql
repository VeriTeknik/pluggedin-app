-- DEPRECATED MIGRATION - DO NOT USE
-- This migration has been superseded by 0064_performance_indexes_concurrent.sql
--
-- REASON: Original migration used CREATE INDEX without CONCURRENTLY keyword,
-- which locks writes on production tables during index creation - a high
-- availability risk for large mcp_activity and docs tables.
--
-- SOLUTION: Migration 0064 creates all indexes with CONCURRENTLY to avoid locks.
--
-- This file is intentionally left as a no-op to maintain migration order.
-- All actual index creation happens in 0064_performance_indexes_concurrent.sql

-- No operations - this migration does nothing
SELECT 1 WHERE FALSE;  -- No-op statement for Drizzle compatibility