-- Database Performance Profiler for Plugged.in Security Features
-- This script analyzes the performance impact of the new security tables and queries

-- ================================
-- QUERY PERFORMANCE ANALYSIS
-- ================================

-- 1. Analyze Admin Role Check Performance
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, email, is_admin, requires_2fa
FROM users
WHERE id = 'sample_user_id' AND is_admin = true;

-- 2. Analyze Audit Log Insert Performance
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details, ip_address, user_agent)
VALUES ('admin_user_id', 'send_bulk_email', 'email_campaign', NULL,
        '{"subject": "Test", "recipientCount": 100}', '192.168.1.1', 'Test-Agent');

-- 3. Analyze Unsubscribe Token Lookup Performance
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, user_id, token_hash, expires_at, used_at
FROM unsubscribe_tokens
WHERE token = 'sample_token'
  AND expires_at >= NOW()
  AND used_at IS NULL;

-- 4. Analyze Admin Audit Log Query Performance
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT admin_id, action, target_type, created_at, details
FROM admin_audit_log
WHERE admin_id = 'admin_user_id'
  AND created_at >= NOW() - INTERVAL '30 days'
ORDER BY created_at DESC
LIMIT 50;

-- ================================
-- INDEX EFFECTIVENESS ANALYSIS
-- ================================

-- Check index usage statistics for new tables
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched,
    CASE
        WHEN idx_scan = 0 THEN 'Never Used'
        WHEN idx_scan < 10 THEN 'Rarely Used'
        WHEN idx_scan < 100 THEN 'Moderately Used'
        ELSE 'Frequently Used'
    END as usage_level,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE tablename IN ('admin_audit_log', 'unsubscribe_tokens', 'users')
ORDER BY tablename, idx_scan DESC;

-- ================================
-- TABLE STATISTICS ANALYSIS
-- ================================

-- Analyze table statistics for performance insights
SELECT
    schemaname,
    tablename,
    n_live_tup as live_rows,
    n_dead_tup as dead_rows,
    CASE
        WHEN n_live_tup > 0
        THEN round((n_dead_tup::float / n_live_tup::float) * 100, 2)
        ELSE 0
    END as dead_tuple_percent,
    seq_scan as sequential_scans,
    seq_tup_read as seq_tuples_read,
    idx_scan as index_scans,
    idx_tup_fetch as idx_tuples_fetched,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze,
    pg_size_pretty(pg_total_relation_size(relid)) as total_size
FROM pg_stat_user_tables
WHERE tablename IN ('admin_audit_log', 'unsubscribe_tokens', 'users', 'audit_logs')
ORDER BY n_live_tup DESC;

-- ================================
-- QUERY PERFORMANCE RECOMMENDATIONS
-- ================================

-- Find slow queries related to security features (requires pg_stat_statements)
SELECT
    query,
    calls,
    total_time,
    mean_time,
    max_time,
    stddev_time,
    rows,
    100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements
WHERE query ILIKE '%admin_audit_log%'
   OR query ILIKE '%unsubscribe_tokens%'
   OR query ILIKE '%is_admin%'
   OR query ILIKE '%requires_2fa%'
ORDER BY total_time DESC
LIMIT 20;

-- ================================
-- FOREIGN KEY PERFORMANCE ANALYSIS
-- ================================

-- Check foreign key constraint performance
SELECT
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('admin_audit_log', 'unsubscribe_tokens')
ORDER BY tc.table_name;

-- ================================
-- LOCK ANALYSIS FOR NEW TABLES
-- ================================

-- Monitor locks on new tables (run during load testing)
SELECT
    l.mode,
    l.granted,
    c.relname as table_name,
    l.pid,
    l.fastpath,
    a.query,
    a.state,
    a.wait_event_type,
    a.wait_event
FROM pg_locks l
JOIN pg_class c ON l.relation = c.oid
LEFT JOIN pg_stat_activity a ON l.pid = a.pid
WHERE c.relname IN ('admin_audit_log', 'unsubscribe_tokens', 'users')
  AND l.mode IS NOT NULL
ORDER BY c.relname, l.mode;

-- ================================
-- BUFFER CACHE ANALYSIS
-- ================================

-- Check buffer cache usage for new tables
SELECT
    c.relname as table_name,
    count(*) as buffers,
    round(100.0 * count(*) / (SELECT setting FROM pg_settings WHERE name='shared_buffers')::int, 1) as percent_of_cache
FROM pg_buffercache b
JOIN pg_class c ON b.relfilenode = pg_relation_filenode(c.oid)
WHERE c.relname IN ('admin_audit_log', 'unsubscribe_tokens', 'users')
GROUP BY c.relname
ORDER BY buffers DESC;

-- ================================
-- PERFORMANCE TUNING SUGGESTIONS
-- ================================

-- Check if statistics are up to date
SELECT
    schemaname,
    tablename,
    last_analyze,
    last_autoanalyze,
    CASE
        WHEN last_analyze IS NULL AND last_autoanalyze IS NULL THEN 'Never analyzed'
        WHEN GREATEST(last_analyze, last_autoanalyze) < NOW() - INTERVAL '7 days' THEN 'Stale statistics'
        ELSE 'Current statistics'
    END as statistics_status
FROM pg_stat_user_tables
WHERE tablename IN ('admin_audit_log', 'unsubscribe_tokens', 'users')
ORDER BY tablename;

-- Suggest missing indexes based on query patterns
-- This would require actual query log analysis, but here are potential candidates:

-- Performance testing queries to run during load tests:

-- 1. Concurrent admin checks
-- Run this with multiple connections simultaneously:
/*
SELECT id, is_admin, requires_2fa
FROM users
WHERE id = $1 AND is_admin = true;
*/

-- 2. Bulk audit log inserts
-- Test with high concurrency:
/*
INSERT INTO admin_audit_log (admin_id, action, target_type, details, ip_address, user_agent)
SELECT
    'admin_' || generate_series(1, 1000),
    'test_action',
    'test_target',
    '{"test": "data"}',
    '192.168.1.' || (generate_series(1, 1000) % 255 + 1),
    'LoadTest-Agent';
*/

-- 3. Token cleanup performance test
/*
DELETE FROM unsubscribe_tokens
WHERE expires_at < NOW() - INTERVAL '7 days';
*/

-- 4. Audit log queries with date ranges
/*
SELECT admin_id, action, created_at, details
FROM admin_audit_log
WHERE created_at >= $1 AND created_at <= $2
ORDER BY created_at DESC;
*/

-- ================================
-- MONITORING QUERIES FOR PRODUCTION
-- ================================

-- Daily audit log growth
SELECT
    date_trunc('day', created_at) as date,
    count(*) as audit_entries,
    count(DISTINCT admin_id) as unique_admins,
    pg_size_pretty(sum(length(details::text))) as total_details_size
FROM admin_audit_log
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY date_trunc('day', created_at)
ORDER BY date DESC;

-- Token generation and usage patterns
SELECT
    date_trunc('hour', created_at) as hour,
    count(*) as tokens_generated,
    count(used_at) as tokens_used,
    count(*) - count(used_at) as tokens_unused,
    round(100.0 * count(used_at) / count(*), 2) as usage_rate_percent
FROM unsubscribe_tokens
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY date_trunc('hour', created_at)
ORDER BY hour DESC
LIMIT 168; -- Last 7 days

-- Admin activity patterns
SELECT
    admin_id,
    count(*) as total_actions,
    count(DISTINCT action) as unique_actions,
    min(created_at) as first_action,
    max(created_at) as last_action,
    string_agg(DISTINCT action, ', ') as actions_performed
FROM admin_audit_log
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY admin_id
ORDER BY total_actions DESC;