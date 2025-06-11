ALTER TABLE "docs" ADD COLUMN "profile_uuid" uuid;--> statement-breakpoint
ALTER TABLE "docs" ADD CONSTRAINT "docs_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "docs_profile_uuid_idx" ON "docs" USING btree ("profile_uuid");