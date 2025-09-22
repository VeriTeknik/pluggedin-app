-- Add missing columns to document_versions table (if they don't exist)
-- This migration ensures compatibility for databases that missed the manual migrations

-- Add file_path column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_versions'
    AND column_name = 'file_path'
  ) THEN
    ALTER TABLE document_versions ADD COLUMN file_path TEXT;
  END IF;
END $$;

-- Add is_current column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_versions'
    AND column_name = 'is_current'
  ) THEN
    ALTER TABLE document_versions ADD COLUMN is_current BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Add rag_document_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_versions'
    AND column_name = 'rag_document_id'
  ) THEN
    ALTER TABLE document_versions ADD COLUMN rag_document_id TEXT;
  END IF;
END $$;

-- Add index for current version lookup
CREATE INDEX IF NOT EXISTS document_versions_is_current_idx
ON document_versions (document_id, is_current)
WHERE is_current = true;

-- Add index for RAG document ID lookup
CREATE INDEX IF NOT EXISTS document_versions_rag_id_idx
ON document_versions (rag_document_id)
WHERE rag_document_id IS NOT NULL;

-- Add composite index for efficient version lookups
CREATE INDEX IF NOT EXISTS document_versions_lookup_idx
ON document_versions (document_id, is_current, version_number DESC);

-- Update existing versions to mark the latest as current (only if not already set)
UPDATE document_versions dv1
SET is_current = true
WHERE dv1.version_number = (
  SELECT MAX(dv2.version_number)
  FROM document_versions dv2
  WHERE dv2.document_id = dv1.document_id
)
AND NOT EXISTS (
  SELECT 1 FROM document_versions dv3
  WHERE dv3.document_id = dv1.document_id
  AND dv3.is_current = true
);

-- Add unique constraint for current version
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'document_versions_current_unique'
  ) THEN
    CREATE UNIQUE INDEX document_versions_current_unique
    ON document_versions (document_id)
    WHERE is_current = true;
  END IF;
END $$;