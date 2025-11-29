-- Add CHECK constraint to ensure entries have either name OR idx, not both or neither
-- This enforces data integrity at the database level for the two access patterns:
-- 1. Named entries: clipboard["key_name"] - uses name column
-- 2. Indexed entries: clipboard[0] - uses idx column

-- The constraint ensures exactly one of name or idx is NOT NULL for each entry
ALTER TABLE "clipboards" ADD CONSTRAINT "clipboards_name_or_idx_check"
CHECK (
  (name IS NOT NULL AND idx IS NULL) OR
  (name IS NULL AND idx IS NOT NULL)
);
