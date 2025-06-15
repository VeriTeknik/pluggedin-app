-- Migration 0036: Commented out to prevent conflicts with 0037
-- This migration was attempting to drop profile_uuid column/constraints
-- but migration 0037 properly handles the profile_uuid column addition
-- 
-- ALTER TABLE "docs" DROP CONSTRAINT "docs_profile_uuid_profiles_uuid_fk";
-- --> statement-breakpoint
-- DROP INDEX "docs_profile_uuid_idx";--> statement-breakpoint
-- ALTER TABLE "docs" DROP COLUMN "profile_uuid";

-- This migration is now a no-op to maintain migration sequence
SELECT 1; -- No-op statement