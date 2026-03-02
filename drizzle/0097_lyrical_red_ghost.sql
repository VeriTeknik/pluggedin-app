ALTER TABLE "dream_consolidations" ALTER COLUMN "source_memory_uuids" SET DATA TYPE uuid[];--> statement-breakpoint
ALTER TABLE "temporal_events" ALTER COLUMN "tool_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "temporal_events" ALTER COLUMN "event_type" SET NOT NULL;