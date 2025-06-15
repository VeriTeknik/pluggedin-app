-- This migration was missing from the file system but exists in the journal
-- Creating a no-op migration to maintain sequence integrity
SELECT 1; 