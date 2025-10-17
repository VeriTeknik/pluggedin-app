-- Migration: API Keys Independence
-- Makes API keys user-owned instead of project-owned
-- Preserves orphaned keys and maintains backward compatibility

-- Phase 1: Add new columns (non-blocking, no defaults or constraints)
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS all_projects_access BOOLEAN,
  ADD COLUMN IF NOT EXISTS project_permissions UUID[],
  ADD COLUMN IF NOT EXISTS version INTEGER,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS usage_count INTEGER,
  ADD COLUMN IF NOT EXISTS last_used_ip TEXT,
  ADD COLUMN IF NOT EXISTS original_project_uuid UUID;

-- Phase 2: Batch populate from existing relationships
DO $$
DECLARE
  batch_size INTEGER := 1000;
  rows_updated INTEGER;
BEGIN
  LOOP
    UPDATE api_keys ak
    SET
      user_id = p.user_id,
      -- Capture project UUID before FK might null it
      project_permissions = ARRAY[ak.project_uuid]::UUID[],
      original_project_uuid = ak.project_uuid,
      version = 0,
      all_projects_access = false,
      is_active = true,
      updated_at = COALESCE(ak.created_at, NOW()),
      usage_count = 0
    FROM projects p
    WHERE ak.project_uuid = p.uuid
      AND ak.user_id IS NULL
      AND ak.uuid IN (
        SELECT uuid FROM api_keys
        WHERE user_id IS NULL
        LIMIT batch_size
      );

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    IF rows_updated = 0 THEN EXIT; END IF;
    PERFORM pg_sleep(0.1);
  END LOOP;
END $$;

-- Phase 3: Handle orphaned keys (preserve with inactive status)
-- Try recovery from audit logs
WITH orphaned_recovery AS (
  SELECT DISTINCT ON (ak.uuid)
    ak.uuid,
    ak.project_uuid,
    COALESCE(proj.user_id, proj2.user_id) as recovered_user_id
  FROM api_keys ak
  LEFT JOIN projects proj ON ak.project_uuid = proj.uuid
  LEFT JOIN audit_logs al ON al.metadata->>'api_key_uuid' = ak.uuid::text
  LEFT JOIN profiles prof ON al.profile_uuid = prof.uuid
  LEFT JOIN projects proj2 ON prof.project_uuid = proj2.uuid
  WHERE ak.user_id IS NULL
  ORDER BY ak.uuid, al.created_at DESC
)
UPDATE api_keys ak
SET
  user_id = or_data.recovered_user_id,
  -- Preserve existing project_permissions if already set, or use project_uuid if not null
  project_permissions = COALESCE(
    ak.project_permissions,
    CASE WHEN ak.project_uuid IS NOT NULL
         THEN ARRAY[ak.project_uuid]::UUID[]
         ELSE ARRAY[]::UUID[]
    END
  ),
  original_project_uuid = COALESCE(ak.original_project_uuid, ak.project_uuid),
  all_projects_access = COALESCE(ak.all_projects_access, false),
  is_active = (or_data.recovered_user_id IS NOT NULL),
  description = CASE
    WHEN or_data.recovered_user_id IS NOT NULL THEN 'Recovered orphaned key'
    ELSE 'Orphaned key - no owner found'
  END
FROM orphaned_recovery or_data
WHERE ak.uuid = or_data.uuid;

-- Update truly orphaned keys (no recovery possible)
UPDATE api_keys
SET
  is_active = false,
  -- Preserve existing arrays or create from project_uuid if available
  project_permissions = COALESCE(
    project_permissions,
    CASE WHEN project_uuid IS NOT NULL
         THEN ARRAY[project_uuid]::UUID[]
         ELSE ARRAY[]::UUID[]
    END
  ),
  original_project_uuid = COALESCE(original_project_uuid, project_uuid),
  description = COALESCE(description, 'Orphaned key - requires manual review'),
  -- Set defaults for orphaned keys to match schema
  version = COALESCE(version, 0),
  all_projects_access = COALESCE(all_projects_access, false),
  usage_count = COALESCE(usage_count, 0),
  updated_at = COALESCE(updated_at, COALESCE(created_at, NOW()))
WHERE user_id IS NULL;

-- Phase 4: Ensure ALL keys have non-null values for required fields
UPDATE api_keys
SET
  version = COALESCE(version, 0),
  all_projects_access = COALESCE(all_projects_access, false),
  is_active = COALESCE(is_active, (user_id IS NOT NULL)),
  usage_count = COALESCE(usage_count, 0),
  updated_at = COALESCE(updated_at, COALESCE(created_at, NOW()));
-- No WHERE clause - applies to ALL rows

-- Verify no nulls in required columns
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM api_keys
    WHERE version IS NULL
       OR all_projects_access IS NULL
       OR is_active IS NULL
       OR usage_count IS NULL
       OR updated_at IS NULL
  ) THEN
    RAISE EXCEPTION 'NULL values still exist in required columns';
  END IF;
END $$;

-- Phase 5: Add NOT NULL constraints after data is clean
ALTER TABLE api_keys
  ALTER COLUMN version SET NOT NULL,
  ALTER COLUMN version SET DEFAULT 0,
  ALTER COLUMN all_projects_access SET NOT NULL,
  ALTER COLUMN all_projects_access SET DEFAULT false,
  ALTER COLUMN is_active SET NOT NULL,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN usage_count SET NOT NULL,
  ALTER COLUMN usage_count SET DEFAULT 0;

-- Phase 6: Make project_uuid nullable
ALTER TABLE api_keys
  ALTER COLUMN project_uuid DROP NOT NULL;

-- Phase 7: Update foreign key to SET NULL on project deletion
ALTER TABLE api_keys
  DROP CONSTRAINT IF EXISTS api_keys_project_uuid_projects_uuid_fk,
  DROP CONSTRAINT IF EXISTS api_keys_project_uuid_fkey;

ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_project_uuid_fkey
  FOREIGN KEY (project_uuid)
  REFERENCES projects(uuid)
  ON DELETE SET NULL;

-- Phase 8: Add user foreign key (allows NULL for orphaned keys)
ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES users(id)
  ON DELETE CASCADE;

-- Phase 9: Add consistency check constraint
ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_active_requires_user
  CHECK (NOT is_active OR user_id IS NOT NULL);

-- Phase 10: Create indexes for performance
CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS api_keys_api_key_idx ON api_keys(api_key);
CREATE INDEX IF NOT EXISTS api_keys_is_active_idx ON api_keys(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS api_keys_orphaned_idx ON api_keys(user_id) WHERE user_id IS NULL;

-- Phase 11: Add trigger for version and timestamp management
CREATE OR REPLACE FUNCTION update_api_keys_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.version = COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS api_keys_timestamps ON api_keys;
CREATE TRIGGER api_keys_timestamps
  BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION update_api_keys_timestamps();

-- Summary: Migration complete
-- - API keys now owned by users
-- - Keys survive project deletion
-- - Orphaned keys preserved as inactive
-- - Full backward compatibility maintained