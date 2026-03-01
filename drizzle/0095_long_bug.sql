ALTER TABLE "collective_feedback" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_ring" ADD COLUMN "cbp_promoted" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "memory_ring" ADD COLUMN "gut_processed" boolean DEFAULT false;--> statement-breakpoint
CREATE INDEX "memory_ring_cbp_not_promoted_idx" ON "memory_ring" USING btree ("cbp_promoted") WHERE cbp_promoted IS NOT TRUE;--> statement-breakpoint
CREATE INDEX "memory_ring_gut_not_processed_idx" ON "memory_ring" USING btree ("gut_processed") WHERE gut_processed IS NOT TRUE;