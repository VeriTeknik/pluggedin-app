-- Migration: Add indexes for metrics query performance
-- Purpose: Optimize COUNT(*) FILTER queries on created_at columns
-- Impact: Reduces query time for platform metrics from ~7 table scans to ~5
-- Date: 2025-01-17
-- Note: Using CONCURRENTLY to avoid table locks during index creation
-- Requires: PostgreSQL 11+ for CONCURRENTLY IF NOT EXISTS syntax

-- Add index on users.created_at for new users count (last 30 days)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Add index on profiles.created_at for new profiles count (last 30 days)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_created_at ON profiles(created_at);
