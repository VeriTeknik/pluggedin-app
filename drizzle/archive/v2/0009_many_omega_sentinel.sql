ALTER TABLE "projects" DROP CONSTRAINT "projects_active_profile_uuid_profiles_uuid_fk";
--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "active_profile_uuid";