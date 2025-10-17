#!/bin/bash

# Script to apply database migrations
# Safe to run on any environment (dev, staging, prod)
# Migrations are idempotent and check for existing state

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get database URL from environment or .env file
if [ -z "$DATABASE_URL" ]; then
    if [ -f .env ]; then
        export DATABASE_URL=$(grep DATABASE_URL .env | cut -d '=' -f2 | tr -d '"')
    else
        echo -e "${RED}Error: DATABASE_URL not set and .env file not found${NC}"
        exit 1
    fi
fi

# Parse DATABASE_URL
DB_URL=$DATABASE_URL
DB_URL=${DB_URL#postgresql://}
DB_URL=${DB_URL#postgres://}

# Extract components
USER_PASS=${DB_URL%%@*}
HOST_PORT_DB=${DB_URL#*@}
HOST_PORT=${HOST_PORT_DB%%/*}
DB_NAME=${HOST_PORT_DB#*/}
DB_NAME=${DB_NAME%%\?*}

USER=${USER_PASS%%:*}
PASS=${USER_PASS#*:}
HOST=${HOST_PORT%%:*}
PORT=${HOST_PORT#*:}

# Default port if not specified
if [ -z "$PORT" ] || [ "$PORT" = "$HOST" ]; then
    PORT="5432"
fi

echo -e "${YELLOW}Database Connection:${NC}"
echo "  Host: $HOST"
echo "  Port: $PORT"
echo "  Database: $DB_NAME"
echo "  User: $USER"
echo ""

# Find migrations directory
if [ -d "migrations" ]; then
    MIGRATIONS_DIR="migrations"
elif [ -d "../migrations" ]; then
    MIGRATIONS_DIR="../migrations"
else
    echo -e "${RED}Error: migrations directory not found${NC}"
    exit 1
fi

echo -e "${YELLOW}Applying migrations from: $MIGRATIONS_DIR${NC}"
echo ""

# Apply each migration in order
for migration in $MIGRATIONS_DIR/*.sql; do
    if [ -f "$migration" ]; then
        filename=$(basename "$migration")
        echo -e "${YELLOW}Applying: $filename${NC}"

        # Apply the migration and capture output
        if PGPASSWORD="$PASS" psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB_NAME" -f "$migration" 2>&1 | tee /tmp/migration_output.txt; then
            # Check if there were any notices
            if grep -q "NOTICE:" /tmp/migration_output.txt; then
                echo -e "${GREEN}✓ Applied with notices${NC}"
            else
                echo -e "${GREEN}✓ Applied successfully${NC}"
            fi
        else
            echo -e "${RED}✗ Failed to apply $filename${NC}"
            exit 1
        fi
        echo ""
    fi
done

echo -e "${GREEN}All migrations completed!${NC}"
echo ""

# Verify the API keys table structure
echo -e "${YELLOW}Verifying API keys table structure:${NC}"
PGPASSWORD="$PASS" psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB_NAME" -c "
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'api_keys'
AND column_name IN ('user_id', 'project_permissions', 'is_active', 'all_projects_access', 'updated_at', 'usage_count')
ORDER BY column_name;
"

# Clean up
rm -f /tmp/migration_output.txt