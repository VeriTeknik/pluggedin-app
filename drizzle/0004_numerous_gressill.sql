ALTER TABLE "codes" ADD COLUMN "profile_uuid" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "codes" ADD CONSTRAINT "codes_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "codes_profile_uuid_idx" ON "codes" USING btree ("profile_uuid");