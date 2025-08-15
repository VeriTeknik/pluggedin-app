#!/bin/bash

# Script to ensure workflow tables exist in any environment
# Run this after deploying to staging or production

echo "Ensuring workflow tables exist in database..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL environment variable is not set"
    exit 1
fi

# Apply the workflow tables migration
psql "$DATABASE_URL" < drizzle/0067_add_workflow_tables.sql

if [ $? -eq 0 ]; then
    echo "✅ Workflow tables ensured successfully"
    
    # Verify the critical columns exist
    psql "$DATABASE_URL" -c "
    SELECT 
        'Verification:' as status,
        COUNT(*) as tables_found
    FROM information_schema.tables 
    WHERE table_name IN (
        'workflow_templates',
        'conversation_workflows',
        'workflow_tasks',
        'workflow_dependencies',
        'workflow_executions',
        'workflow_learning'
    );"
    
    psql "$DATABASE_URL" -c "
    SELECT 
        'Critical columns:' as status,
        COUNT(*) as columns_found
    FROM information_schema.columns 
    WHERE 
        (table_name = 'conversation_workflows' AND column_name = 'learned_optimizations')
        OR (table_name = 'conversation_tasks' AND column_name IN ('workflow_task_id', 'is_workflow_generated', 'workflow_metadata'));"
    
else
    echo "❌ Failed to ensure workflow tables"
    exit 1
fi