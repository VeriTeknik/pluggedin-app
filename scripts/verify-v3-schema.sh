#!/bin/bash

echo "=== Verifying V3 Schema ==="
echo ""

# Database connection details
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5433}
DB_NAME=${DB_NAME:-pluggedin_v3}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-postgres123}

export PGPASSWORD=$DB_PASSWORD

echo "Connecting to database: $DB_NAME at $DB_HOST:$DB_PORT"
echo ""

# Count tables
echo "📊 Total tables in database:"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"

echo ""
echo "📋 List of all tables:"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"

echo ""
echo "🔍 Checking for removed tables (should not exist):"
for table in "system_logs" "log_retention_policies" "notification_settings" "log_settings" "syslog_settings" "user_server_favorites" "secure_unsubscribe_tokens"; do
  result=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table';")
  if [ "$result" -eq 0 ]; then
    echo "  ✅ $table - correctly removed"
  else
    echo "  ❌ $table - still exists (should be removed)"
  fi
done

echo ""
echo "✨ Schema verification complete!"