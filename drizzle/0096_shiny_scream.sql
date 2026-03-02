CREATE TABLE "dream_consolidations" (
	"uuid" uuid PRIMARY KEY NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"result_memory_uuid" uuid,
	"source_memory_uuids" uuid[] NOT NULL,
	"cluster_similarity" real,
	"token_savings" integer,
	"source_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "individuation_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"total_score" smallint NOT NULL,
	"memory_depth" smallint,
	"learning_velocity" smallint,
	"collective_contribution" smallint,
	"self_awareness" smallint,
	"maturity_level" varchar(20),
	"snapshot_date" date DEFAULT (now() AT TIME ZONE 'UTC')::date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "temporal_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"profile_hash" text NOT NULL,
	"tool_name" varchar(255) NOT NULL,
	"event_type" varchar(30) NOT NULL,
	"outcome" varchar(10),
	"context_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "temporal_events_outcome_check" CHECK (outcome IS NULL OR outcome IN ('success', 'failure', 'neutral'))
);
--> statement-breakpoint
ALTER TABLE "memory_ring" ADD COLUMN "dream_cluster_id" uuid;--> statement-breakpoint
ALTER TABLE "memory_ring" ADD COLUMN "dream_processed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dream_consolidations" ADD CONSTRAINT "dream_consolidations_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dream_consolidations" ADD CONSTRAINT "dream_consolidations_result_memory_uuid_memory_ring_uuid_fk" FOREIGN KEY ("result_memory_uuid") REFERENCES "public"."memory_ring"("uuid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "individuation_snapshots" ADD CONSTRAINT "individuation_snapshots_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dream_profile" ON "dream_consolidations" USING btree ("profile_uuid","created_at");--> statement-breakpoint
CREATE INDEX "idx_dream_result" ON "dream_consolidations" USING btree ("result_memory_uuid");--> statement-breakpoint
CREATE INDEX "idx_individuation_profile_date" ON "individuation_snapshots" USING btree ("profile_uuid","snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_individuation_unique_daily" ON "individuation_snapshots" USING btree ("profile_uuid","snapshot_date");--> statement-breakpoint
CREATE INDEX "idx_temporal_tool_outcome_time" ON "temporal_events" USING btree ("tool_name","outcome","created_at");--> statement-breakpoint
CREATE INDEX "idx_temporal_time" ON "temporal_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_temporal_profile_time" ON "temporal_events" USING btree ("profile_hash","created_at");--> statement-breakpoint
CREATE INDEX "idx_memory_ring_dream_cluster" ON "memory_ring" USING btree ("dream_cluster_id");--> statement-breakpoint
CREATE INDEX "idx_memory_ring_dream_processed" ON "memory_ring" USING btree ("dream_processed_at") WHERE dream_processed_at IS NOT NULL;