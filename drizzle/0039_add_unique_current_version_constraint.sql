-- Add unique constraint to ensure only one current version per document
-- This prevents race conditions and data inconsistency

-- Drop any existing index with the same name (if exists)
DROP INDEX IF EXISTS idx_one_current_version_per_doc;

-- Create a unique partial index to enforce one current version per document
-- This index only applies when is_current = true
CREATE UNIQUE INDEX CONCURRENTLY idx_one_current_version_per_doc
ON document_versions (document_id)
WHERE is_current = true;

-- Add comment explaining the constraint
COMMENT ON INDEX idx_one_current_version_per_doc IS 'Ensures only one version can be marked as current per document';

-- Add check constraint to prevent deleting current versions (optional)
-- This is commented out as it might be too restrictive for some use cases
-- ALTER TABLE document_versions
-- ADD CONSTRAINT check_no_delete_current
-- CHECK (NOT (is_current = true AND deleted_at IS NOT NULL));

-- Verify the constraint by checking for any violations
-- This query should return 0 rows
SELECT document_id, COUNT(*) as current_count
FROM document_versions
WHERE is_current = true
GROUP BY document_id
HAVING COUNT(*) > 1;