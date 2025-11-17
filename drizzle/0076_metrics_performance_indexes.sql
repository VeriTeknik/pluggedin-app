-- Migration: Add indexes for metrics query performance
-- Purpose: Optimize COUNT(*) FILTER queries on created_at columns
-- Impact: Reduces query time for platform metrics from ~7 table scans to ~5
-- Date: 2025-01-17
-- Note: Using CONCURRENTLY to avoid table locks during index creation

-- Add index on users.created_at for new users count (last 30 days)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_users_created_at'
    ) THEN
        CREATE INDEX CONCURRENTLY idx_users_created_at ON users(created_at);
    END IF;
END $$;

-- Add index on profiles.created_at for new profiles count (last 30 days)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_profiles_created_at'
    ) THEN
        CREATE INDEX CONCURRENTLY idx_profiles_created_at ON profiles(created_at);
    END IF;
END $$;
