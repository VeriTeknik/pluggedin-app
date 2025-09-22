ALTER TABLE "codes" DROP CONSTRAINT "codes_profile_uuid_profiles_uuid_fk";
--> statement-breakpoint
DROP INDEX "codes_profile_uuid_idx";--> statement-breakpoint
ALTER TABLE "codes" DROP COLUMN "profile_uuid";