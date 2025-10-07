# Analytics Performance Indexes - Migration Guide

## Overview

Two migrations were created for analytics performance optimization:
- **0063**: Originally contained non-concurrent index creation (now deprecated/no-op)
- **0064**: Concurrent index creation (safe for production)

## Problem with Migration 0063

The original migration `0063_performance_optimization_indexes.sql` used:
```sql
CREATE INDEX IF NOT EXISTS idx_name ON table(...);
```

**Issue**: This locks writes on the target table for the entire duration of index creation, which can be:
- Several seconds on small tables
- Several minutes on medium tables
- Several hours on large production tables (millions of rows)

**Risk**: Production downtime or severe performance degradation during deployment.

## Solution: Migration 0064

Migration `0064_performance_indexes_concurrent.sql` uses:
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_name ON table(...);
```

**Benefits**:
- ✅ No write locks - production traffic continues normally
- ✅ Creates indexes in the background
- ✅ Safe for large tables
- ✅ Can be monitored with `pg_stat_progress_create_index`

## Deployment Strategy

### Option 1: Fresh Install (Recommended)
If you haven't run ANY migrations yet:

```bash
# Migration 0063 will execute but do nothing (no-op)
# Migration 0064 requires manual execution
pnpm db:migrate

# Then manually run 0064
psql $DATABASE_URL -f drizzle/0064_performance_indexes_concurrent.sql
```

### Option 2: Already Ran 0063 (Has Non-Concurrent Indexes)
If migration 0063 was already executed with the old version:

```bash
# Drop the old non-concurrent indexes first (during low-traffic)
psql $DATABASE_URL << 'EOF'
DROP INDEX IF EXISTS idx_mcp_activity_tool_combinations;
DROP INDEX IF EXISTS idx_mcp_activity_item_name;
DROP INDEX IF EXISTS idx_mcp_activity_daily_stats;
DROP INDEX IF EXISTS idx_docs_profile_created;
DROP INDEX IF EXISTS idx_docs_source;
DROP INDEX IF EXISTS idx_mcp_activity_external_id;
DROP INDEX IF EXISTS idx_mcp_activity_lifetime_stats;
EOF

# Then create concurrent indexes
psql $DATABASE_URL -f drizzle/0064_performance_indexes_concurrent.sql
```

### Option 3: Production with Zero Downtime
For large production databases:

```bash
# Run each index creation separately and monitor
psql $DATABASE_URL << 'EOF'
-- Monitor with: SELECT * FROM pg_stat_progress_create_index;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mcp_activity_tool_combinations
ON mcp_activity(profile_uuid, action, created_at DESC)
WHERE action = 'tool_call';

-- Repeat for each index...
-- Check progress between each one
EOF
```

## Monitoring Index Creation

While indexes are building:

```sql
-- Check progress (shows % complete)
SELECT
  phase,
  blocks_done,
  blocks_total,
  ROUND(100.0 * blocks_done / NULLIF(blocks_total, 0), 2) AS pct_complete,
  tuples_done,
  tuples_total
FROM pg_stat_progress_create_index;

-- Check existing indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('mcp_activity', 'docs', 'mcp_servers')
ORDER BY indexname;
```

## Important Notes

### CONCURRENTLY Limitations
- ❌ Cannot be used inside a transaction block
- ❌ Cannot use `BEGIN; ... COMMIT;` wrapper
- ⚠️  If interrupted, may leave an INVALID index (check with `\d table_name`)
- ⚠️  Requires more total I/O than non-concurrent (but doesn't block)

### Invalid Indexes
If index creation fails or is interrupted:

```sql
-- Find invalid indexes
SELECT indexname
FROM pg_indexes
WHERE indexname LIKE 'idx_%'
  AND NOT indisvalid;

-- Drop invalid index
DROP INDEX CONCURRENTLY idx_invalid_index_name;

-- Retry creation
CREATE INDEX CONCURRENTLY idx_name ON table(...);
```

## Recommended Production Procedure

1. **Pre-check**:
   ```sql
   SELECT COUNT(*) FROM mcp_activity;  -- Check table size
   SELECT COUNT(*) FROM docs;
   ```

2. **Schedule during low-traffic** (though CONCURRENTLY is safe anytime)

3. **Run migration**:
   ```bash
   psql $DATABASE_URL -f drizzle/0064_performance_indexes_concurrent.sql
   ```

4. **Monitor progress** (in separate terminal):
   ```sql
   \watch 5  -- Updates every 5 seconds
   SELECT * FROM pg_stat_progress_create_index;
   ```

5. **Verify completion**:
   ```sql
   -- All 7 indexes should exist
   SELECT indexname FROM pg_indexes
   WHERE tablename IN ('mcp_activity', 'docs')
   AND indexname LIKE 'idx_%'
   ORDER BY indexname;
   ```

6. **Mark migration as complete** (if run manually):
   ```sql
   INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
   VALUES (
     (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1),
     NOW()
   );
   ```

## Troubleshooting

### Migration 0063 Already Ran with Locks
If you experienced downtime because 0063 already ran:
- The indexes already exist (non-concurrent version)
- You can optionally recreate them concurrently (see Option 2 above)
- Or leave them as-is if the one-time lock was acceptable

### Drizzle Tries to Run 0064 in Transaction
```
ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block
```

**Solution**: Run 0064 manually outside Drizzle:
```bash
psql $DATABASE_URL -f drizzle/0064_performance_indexes_concurrent.sql
```

### Indexes Already Exist Error
```
ERROR: relation "idx_name" already exists
```

**This is OK** - means migration 0063 already created them. The `IF NOT EXISTS` clause prevents this, but some PostgreSQL versions still error. Safe to ignore or use `DROP INDEX IF EXISTS` first.

## Summary

| Migration | Status | Execution Method |
|-----------|--------|------------------|
| 0063 | Deprecated (no-op) | Automatic via `pnpm db:migrate` |
| 0064 | Active (concurrent) | **Manual** via `psql` |

**Bottom line**: Always use CONCURRENTLY for production index creation on large tables.