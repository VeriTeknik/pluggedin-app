-- API Keys User Ownership Migration
-- This migration makes API keys user-owned instead of project-owned
-- It's safe to run multiple times and checks for existing state

BEGIN;

-- Create a temporary function to check if a column exists
CREATE OR REPLACE FUNCTION column_exists(table_name text, column_name text)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    );
END;
$$ LANGUAGE plpgsql;

-- Create a temporary function to check if an index exists
CREATE OR REPLACE FUNCTION index_exists(index_name text)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
        AND indexname = $1
    );
END;
$$ LANGUAGE plpgsql;

-- Create a temporary function to check if a constraint exists
CREATE OR REPLACE FUNCTION constraint_exists(table_name text, constraint_name text)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
        AND table_name = $1
        AND constraint_name = $2
    );
END;
$$ LANGUAGE plpgsql;

-- Step 1: Add new columns if they don't exist
DO $$
BEGIN
    IF NOT column_exists('api_keys', 'user_id') THEN
        ALTER TABLE api_keys ADD COLUMN user_id TEXT;
        RAISE NOTICE 'Added column: user_id';
    END IF;

    IF NOT column_exists('api_keys', 'original_project_uuid') THEN
        ALTER TABLE api_keys ADD COLUMN original_project_uuid UUID;
        RAISE NOTICE 'Added column: original_project_uuid';
    END IF;

    IF NOT column_exists('api_keys', 'description') THEN
        ALTER TABLE api_keys ADD COLUMN description TEXT;
        RAISE NOTICE 'Added column: description';
    END IF;

    IF NOT column_exists('api_keys', 'all_projects_access') THEN
        ALTER TABLE api_keys ADD COLUMN all_projects_access BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added column: all_projects_access';
    END IF;

    IF NOT column_exists('api_keys', 'project_permissions') THEN
        ALTER TABLE api_keys ADD COLUMN project_permissions UUID[];
        RAISE NOTICE 'Added column: project_permissions';
    END IF;

    IF NOT column_exists('api_keys', 'is_active') THEN
        ALTER TABLE api_keys ADD COLUMN is_active BOOLEAN DEFAULT true;
        RAISE NOTICE 'Added column: is_active';
    END IF;

    IF NOT column_exists('api_keys', 'expires_at') THEN
        ALTER TABLE api_keys ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added column: expires_at';
    END IF;

    IF NOT column_exists('api_keys', 'updated_at') THEN
        ALTER TABLE api_keys ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE 'Added column: updated_at';
    END IF;

    IF NOT column_exists('api_keys', 'last_used_at') THEN
        ALTER TABLE api_keys ADD COLUMN last_used_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added column: last_used_at';
    END IF;

    IF NOT column_exists('api_keys', 'usage_count') THEN
        ALTER TABLE api_keys ADD COLUMN usage_count INTEGER DEFAULT 0;
        RAISE NOTICE 'Added column: usage_count';
    END IF;

    IF NOT column_exists('api_keys', 'last_used_ip') THEN
        ALTER TABLE api_keys ADD COLUMN last_used_ip TEXT;
        RAISE NOTICE 'Added column: last_used_ip';
    END IF;

    IF NOT column_exists('api_keys', 'version') THEN
        ALTER TABLE api_keys ADD COLUMN version INTEGER DEFAULT 0;
        RAISE NOTICE 'Added column: version';
    END IF;
END $$;

-- Step 2: Populate user_id from existing project relationships (only for records without user_id)
UPDATE api_keys ak
SET
  user_id = p.user_id,
  project_permissions = COALESCE(
    ak.project_permissions,
    CASE
      WHEN ak.project_uuid IS NOT NULL THEN ARRAY[ak.project_uuid]::UUID[]
      ELSE ARRAY[]::UUID[]
    END
  ),
  original_project_uuid = COALESCE(ak.original_project_uuid, ak.project_uuid)
FROM projects p
WHERE ak.project_uuid = p.uuid
  AND ak.user_id IS NULL;

RAISE NOTICE 'Updated % API keys with user_id from projects', ROW_COUNT;

-- Step 3: Handle orphaned keys (projects have been deleted)
UPDATE api_keys
SET
  is_active = false,
  project_permissions = COALESCE(
    project_permissions,
    CASE
      WHEN project_uuid IS NOT NULL THEN ARRAY[project_uuid]::UUID[]
      ELSE ARRAY[]::UUID[]
    END
  ),
  original_project_uuid = COALESCE(original_project_uuid, project_uuid)
WHERE user_id IS NULL
  AND project_uuid IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM projects p WHERE p.uuid = api_keys.project_uuid
  );

-- Step 4: Set default values for NULL columns
UPDATE api_keys SET all_projects_access = false WHERE all_projects_access IS NULL;
UPDATE api_keys SET is_active = true WHERE is_active IS NULL;
UPDATE api_keys SET updated_at = NOW() WHERE updated_at IS NULL;
UPDATE api_keys SET usage_count = 0 WHERE usage_count IS NULL;
UPDATE api_keys SET version = 0 WHERE version IS NULL;
UPDATE api_keys SET project_permissions = ARRAY[]::UUID[] WHERE project_permissions IS NULL;

-- Step 5: Add NOT NULL constraints if they don't exist
DO $$
DECLARE
    v_constraint_exists boolean;
BEGIN
    -- Check if columns are already NOT NULL
    SELECT is_nullable = 'NO' INTO v_constraint_exists
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'api_keys'
    AND column_name = 'all_projects_access';

    IF NOT v_constraint_exists THEN
        ALTER TABLE api_keys ALTER COLUMN all_projects_access SET NOT NULL;
        RAISE NOTICE 'Set NOT NULL: all_projects_access';
    END IF;

    SELECT is_nullable = 'NO' INTO v_constraint_exists
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'api_keys'
    AND column_name = 'is_active';

    IF NOT v_constraint_exists THEN
        ALTER TABLE api_keys ALTER COLUMN is_active SET NOT NULL;
        RAISE NOTICE 'Set NOT NULL: is_active';
    END IF;

    SELECT is_nullable = 'NO' INTO v_constraint_exists
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'api_keys'
    AND column_name = 'updated_at';

    IF NOT v_constraint_exists THEN
        ALTER TABLE api_keys ALTER COLUMN updated_at SET NOT NULL;
        RAISE NOTICE 'Set NOT NULL: updated_at';
    END IF;

    SELECT is_nullable = 'NO' INTO v_constraint_exists
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'api_keys'
    AND column_name = 'usage_count';

    IF NOT v_constraint_exists THEN
        ALTER TABLE api_keys ALTER COLUMN usage_count SET NOT NULL;
        RAISE NOTICE 'Set NOT NULL: usage_count';
    END IF;

    SELECT is_nullable = 'NO' INTO v_constraint_exists
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'api_keys'
    AND column_name = 'version';

    IF NOT v_constraint_exists THEN
        ALTER TABLE api_keys ALTER COLUMN version SET NOT NULL;
        RAISE NOTICE 'Set NOT NULL: version';
    END IF;
END $$;

-- Step 6: Modify project_uuid constraint
DO $$
BEGIN
    -- Drop the old CASCADE constraint if it exists
    IF constraint_exists('api_keys', 'api_keys_project_uuid_projects_uuid_fk') THEN
        ALTER TABLE api_keys DROP CONSTRAINT api_keys_project_uuid_projects_uuid_fk;
        RAISE NOTICE 'Dropped old project_uuid foreign key';
    END IF;

    -- Make project_uuid nullable
    ALTER TABLE api_keys ALTER COLUMN project_uuid DROP NOT NULL;
    RAISE NOTICE 'Made project_uuid nullable';

    -- Add new SET NULL constraint
    ALTER TABLE api_keys ADD CONSTRAINT api_keys_project_uuid_projects_uuid_fk
        FOREIGN KEY (project_uuid) REFERENCES projects(uuid) ON DELETE SET NULL;
    RAISE NOTICE 'Added new project_uuid foreign key with SET NULL';
END $$;

-- Step 7: Add user_id foreign key constraint
DO $$
BEGIN
    IF NOT constraint_exists('api_keys', 'api_keys_user_id_users_id_fk') THEN
        ALTER TABLE api_keys ADD CONSTRAINT api_keys_user_id_users_id_fk
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added user_id foreign key';
    END IF;
END $$;

-- Step 8: Create indexes
DO $$
BEGIN
    IF NOT index_exists('api_keys_user_id_idx') THEN
        CREATE INDEX api_keys_user_id_idx ON api_keys(user_id);
        RAISE NOTICE 'Created index: api_keys_user_id_idx';
    END IF;

    IF NOT index_exists('api_keys_api_key_idx') THEN
        CREATE INDEX api_keys_api_key_idx ON api_keys(api_key);
        RAISE NOTICE 'Created index: api_keys_api_key_idx';
    END IF;

    IF NOT index_exists('api_keys_is_active_idx') THEN
        CREATE INDEX api_keys_is_active_idx ON api_keys(is_active) WHERE is_active = true;
        RAISE NOTICE 'Created index: api_keys_is_active_idx';
    END IF;

    IF NOT index_exists('api_keys_orphaned_idx') THEN
        CREATE INDEX api_keys_orphaned_idx ON api_keys(user_id) WHERE user_id IS NULL;
        RAISE NOTICE 'Created index: api_keys_orphaned_idx';
    END IF;

    IF NOT index_exists('api_keys_project_uuid_idx') THEN
        CREATE INDEX api_keys_project_uuid_idx ON api_keys(project_uuid);
        RAISE NOTICE 'Created index: api_keys_project_uuid_idx';
    END IF;
END $$;

-- Step 9: Record migration in Drizzle migrations table (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '__drizzle_migrations') THEN
        -- Check if we need to add the migration record
        IF NOT EXISTS (
            SELECT 1 FROM drizzle.__drizzle_migrations
            WHERE hash = 'api_keys_user_ownership_v1'
        ) THEN
            INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
            VALUES ('api_keys_user_ownership_v1', EXTRACT(EPOCH FROM NOW())::bigint * 1000);
            RAISE NOTICE 'Recorded migration in Drizzle migrations table';
        END IF;
    END IF;
END $$;

-- Clean up temporary functions
DROP FUNCTION IF EXISTS column_exists(text, text);
DROP FUNCTION IF EXISTS index_exists(text);
DROP FUNCTION IF EXISTS constraint_exists(text, text);

-- Final verification
DO $$
DECLARE
    v_columns_added integer;
BEGIN
    SELECT COUNT(*) INTO v_columns_added
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'api_keys'
    AND column_name IN ('user_id', 'project_permissions', 'is_active', 'all_projects_access');

    RAISE NOTICE 'Verification: Found % of 4 expected columns', v_columns_added;

    IF v_columns_added = 4 THEN
        RAISE NOTICE '✓ Migration completed successfully!';
    ELSE
        RAISE WARNING '⚠ Some columns may not have been created';
    END IF;
END $$;

-- Step 10: Create version increment trigger for optimistic locking
DO $$
BEGIN
  -- Drop trigger and function if they exist
  DROP TRIGGER IF EXISTS api_keys_version_increment ON api_keys;
  DROP FUNCTION IF EXISTS increment_api_keys_version CASCADE;

  -- Create function to increment version
  CREATE FUNCTION increment_api_keys_version()
  RETURNS TRIGGER AS $func$
  BEGIN
    NEW.version := OLD.version + 1;
    NEW.updated_at := NOW();
    RETURN NEW;
  END;
  $func$ LANGUAGE plpgsql;

  -- Create trigger to run before each update
  CREATE TRIGGER api_keys_version_increment
  BEFORE UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION increment_api_keys_version();

  RAISE NOTICE 'Created version increment trigger for optimistic locking';
END $$;

COMMIT;