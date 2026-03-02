DROP INDEX "idx_dream_profile";--> statement-breakpoint
ALTER TABLE "memory_ring" ADD COLUMN "dream_processed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_dream_profile" ON "dream_consolidations" USING btree ("profile_uuid","created_at");