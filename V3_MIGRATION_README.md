# V3.0 Database Migration Testing

This document explains how to test the v3.0 database migration in a Docker environment.

## Overview

The v3.0 migration consolidates 76+ migration files into 2 clean files:
- `0000_v3_baseline.sql` - Complete schema definition
- `0001_v3_cleanup_unused_tables.sql` - Drops 7 unused tables

## Quick Start

### 1. Build and Start Containers

```bash
# Build the Docker images
docker-compose -f docker-compose.v3.yml build

# Start all services (database, migrations, app)
docker-compose -f docker-compose.v3.yml up -d

# Check status
docker-compose -f docker-compose.v3.yml ps
```

### 2. Verify the Schema

```bash
# Run the verification script
./scripts/verify-v3-schema.sh

# Or manually check with psql
docker exec -it pluggedin-postgres-v3 psql -U postgres -d pluggedin_v3 -c "\dt"
```

### 3. Access the Application

- **Application**: http://localhost:12005
- **Database**: localhost:5433 (postgres/postgres123)

## What Changed in V3

### Removed Tables (7 total)
- `system_logs` - Unused logging table
- `log_retention_policies` - Unused log retention config
- `notification_settings` - Never implemented
- `log_settings` - Never implemented
- `syslog_settings` - Never implemented
- `user_server_favorites` - Never implemented
- `secure_unsubscribe_tokens` - Duplicate of unsubscribe_tokens

### Code Changes
- Removed references to `systemLogsTable` in `mcp-server-logger.ts`
- Removed references to `logRetentionPoliciesTable` in `log-retention.ts`
- Cleaned up unused relation definitions in `schema.ts`

## Testing Checklist

- [ ] Docker containers start successfully
- [ ] Database migrations run without errors
- [ ] All 7 unused tables are removed
- [ ] Application builds and runs
- [ ] Login/Register functionality works
- [ ] MCP servers can be created/managed
- [ ] No errors in console/logs

## Troubleshooting

### View Migration Logs
```bash
docker logs pluggedin-migrate-v3
```

### View Application Logs
```bash
docker logs pluggedin-app-v3
```

### Connect to Database
```bash
docker exec -it pluggedin-postgres-v3 psql -U postgres -d pluggedin_v3
```

### Reset Everything
```bash
# Stop and remove containers
docker-compose -f docker-compose.v3.yml down -v

# Start fresh
docker-compose -f docker-compose.v3.yml up -d
```

## Deployment to Production

Once testing is successful:

1. Backup production database
2. Run the cleanup migration (`0001_v3_cleanup_unused_tables.sql`)
3. Deploy the updated application code
4. Monitor for any issues

## Notes

- The v3 schema is backward compatible (only removes unused tables)
- No data migration is required
- Application functionality remains unchanged