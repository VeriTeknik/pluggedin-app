ALTER TABLE "docs" DROP CONSTRAINT "docs_profile_uuid_profiles_uuid_fk";
--> statement-breakpoint
DROP INDEX "docs_profile_uuid_idx";--> statement-breakpoint
ALTER TABLE "docs" DROP COLUMN "profile_uuid";