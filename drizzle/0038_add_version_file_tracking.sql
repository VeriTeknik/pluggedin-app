-- Add file_path, is_current, and rag_document_id columns to document_versions table
ALTER TABLE document_versions
ADD COLUMN IF NOT EXISTS file_path TEXT,
ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS rag_document_id TEXT;

-- Add index for current version lookup
CREATE INDEX IF NOT EXISTS document_versions_is_current_idx
ON document_versions (document_id, is_current)
WHERE is_current = true;

-- Add index for RAG document ID lookup
CREATE INDEX IF NOT EXISTS document_versions_rag_id_idx
ON document_versions (rag_document_id)
WHERE rag_document_id IS NOT NULL;

-- Update existing versions to mark the latest as current
UPDATE document_versions dv1
SET is_current = true
WHERE dv1.version_number = (
  SELECT MAX(dv2.version_number)
  FROM document_versions dv2
  WHERE dv2.document_id = dv1.document_id
);

-- Add comment to explain the columns
COMMENT ON COLUMN document_versions.file_path IS 'Path to the version file on disk';
COMMENT ON COLUMN document_versions.is_current IS 'Whether this is the current version of the document';
COMMENT ON COLUMN document_versions.rag_document_id IS 'RAG document ID for this specific version';