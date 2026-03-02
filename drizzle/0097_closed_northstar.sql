ALTER TABLE "dream_consolidations" DROP CONSTRAINT "dream_consolidations_profile_uuid_profiles_uuid_fk";
--> statement-breakpoint
ALTER TABLE "dream_consolidations" DROP CONSTRAINT "dream_consolidations_result_memory_uuid_memory_ring_uuid_fk";
--> statement-breakpoint
ALTER TABLE "individuation_snapshots" DROP CONSTRAINT "individuation_snapshots_profile_uuid_profiles_uuid_fk";
--> statement-breakpoint
ALTER TABLE "dream_consolidations" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "individuation_snapshots" ALTER COLUMN "snapshot_date" SET DEFAULT (now() AT TIME ZONE 'UTC')::date;--> statement-breakpoint
ALTER TABLE "dream_consolidations" ADD CONSTRAINT "dream_consolidations_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dream_consolidations" ADD CONSTRAINT "dream_consolidations_result_memory_uuid_memory_ring_uuid_fk" FOREIGN KEY ("result_memory_uuid") REFERENCES "public"."memory_ring"("uuid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "individuation_snapshots" ADD CONSTRAINT "individuation_snapshots_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;