CREATE TABLE "fresh_memory" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"session_uuid" uuid NOT NULL,
	"agent_uuid" uuid,
	"observation_type" varchar(30) NOT NULL,
	"content" text NOT NULL,
	"token_count" integer NOT NULL,
	"classified" boolean DEFAULT false,
	"classified_ring" varchar(20),
	"classified_at" timestamp with time zone,
	"classification_confidence" real,
	"outcome" varchar(10),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gut_patterns" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern_hash" text NOT NULL,
	"pattern_type" varchar(50) NOT NULL,
	"pattern_description" text NOT NULL,
	"occurrence_count" integer DEFAULT 1,
	"success_rate" real,
	"unique_profile_count" integer DEFAULT 1,
	"compressed_pattern" text NOT NULL,
	"confidence" real DEFAULT 0.5,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gut_patterns_pattern_hash_unique" UNIQUE("pattern_hash")
);
--> statement-breakpoint
CREATE TABLE "memory_ring" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"agent_uuid" uuid,
	"ring_type" varchar(20) NOT NULL,
	"content_full" text,
	"content_compressed" text,
	"content_summary" text,
	"content_essence" text,
	"current_decay_stage" varchar(20) DEFAULT 'full' NOT NULL,
	"current_token_count" integer NOT NULL,
	"access_count" integer DEFAULT 0,
	"last_accessed_at" timestamp with time zone,
	"relevance_score" real DEFAULT 1,
	"success_score" real,
	"reinforcement_count" integer DEFAULT 0,
	"source_session_uuid" uuid,
	"source_observation_uuids" text[],
	"next_decay_at" timestamp with time zone,
	"is_shock" boolean DEFAULT false,
	"shock_severity" real,
	"tags" text[] DEFAULT '{}'::text[],
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_sessions" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"agent_uuid" uuid,
	"content_session_id" text NOT NULL,
	"memory_session_id" text NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"z_report" jsonb,
	"focus_items" jsonb DEFAULT '[]'::jsonb,
	"observation_count" integer DEFAULT 0,
	"total_tokens" integer DEFAULT 0,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_sessions_memory_session_id_unique" UNIQUE("memory_session_id")
);
--> statement-breakpoint
ALTER TABLE "fresh_memory" ADD CONSTRAINT "fresh_memory_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fresh_memory" ADD CONSTRAINT "fresh_memory_session_uuid_memory_sessions_uuid_fk" FOREIGN KEY ("session_uuid") REFERENCES "public"."memory_sessions"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fresh_memory" ADD CONSTRAINT "fresh_memory_agent_uuid_agents_uuid_fk" FOREIGN KEY ("agent_uuid") REFERENCES "public"."agents"("uuid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_ring" ADD CONSTRAINT "memory_ring_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_ring" ADD CONSTRAINT "memory_ring_agent_uuid_agents_uuid_fk" FOREIGN KEY ("agent_uuid") REFERENCES "public"."agents"("uuid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_ring" ADD CONSTRAINT "memory_ring_source_session_uuid_memory_sessions_uuid_fk" FOREIGN KEY ("source_session_uuid") REFERENCES "public"."memory_sessions"("uuid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_sessions" ADD CONSTRAINT "memory_sessions_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_sessions" ADD CONSTRAINT "memory_sessions_agent_uuid_agents_uuid_fk" FOREIGN KEY ("agent_uuid") REFERENCES "public"."agents"("uuid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fresh_memory_profile_uuid_idx" ON "fresh_memory" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "fresh_memory_session_uuid_idx" ON "fresh_memory" USING btree ("session_uuid");--> statement-breakpoint
CREATE INDEX "fresh_memory_agent_uuid_idx" ON "fresh_memory" USING btree ("agent_uuid");--> statement-breakpoint
CREATE INDEX "fresh_memory_observation_type_idx" ON "fresh_memory" USING btree ("observation_type");--> statement-breakpoint
CREATE INDEX "fresh_memory_classified_idx" ON "fresh_memory" USING btree ("classified");--> statement-breakpoint
CREATE INDEX "fresh_memory_created_at_idx" ON "fresh_memory" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "fresh_memory_expires_at_idx" ON "fresh_memory" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "fresh_memory_profile_classified_idx" ON "fresh_memory" USING btree ("profile_uuid","classified");--> statement-breakpoint
CREATE INDEX "gut_patterns_pattern_hash_idx" ON "gut_patterns" USING btree ("pattern_hash");--> statement-breakpoint
CREATE INDEX "gut_patterns_pattern_type_idx" ON "gut_patterns" USING btree ("pattern_type");--> statement-breakpoint
CREATE INDEX "gut_patterns_confidence_idx" ON "gut_patterns" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "gut_patterns_occurrence_count_idx" ON "gut_patterns" USING btree ("occurrence_count");--> statement-breakpoint
CREATE INDEX "gut_patterns_success_rate_idx" ON "gut_patterns" USING btree ("success_rate");--> statement-breakpoint
CREATE INDEX "memory_ring_profile_uuid_idx" ON "memory_ring" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "memory_ring_agent_uuid_idx" ON "memory_ring" USING btree ("agent_uuid");--> statement-breakpoint
CREATE INDEX "memory_ring_ring_type_idx" ON "memory_ring" USING btree ("ring_type");--> statement-breakpoint
CREATE INDEX "memory_ring_decay_stage_idx" ON "memory_ring" USING btree ("current_decay_stage");--> statement-breakpoint
CREATE INDEX "memory_ring_relevance_score_idx" ON "memory_ring" USING btree ("relevance_score");--> statement-breakpoint
CREATE INDEX "memory_ring_next_decay_at_idx" ON "memory_ring" USING btree ("next_decay_at");--> statement-breakpoint
CREATE INDEX "memory_ring_is_shock_idx" ON "memory_ring" USING btree ("is_shock");--> statement-breakpoint
CREATE INDEX "memory_ring_profile_ring_type_idx" ON "memory_ring" USING btree ("profile_uuid","ring_type");--> statement-breakpoint
CREATE INDEX "memory_ring_last_accessed_idx" ON "memory_ring" USING btree ("last_accessed_at");--> statement-breakpoint
CREATE INDEX "memory_ring_profile_relevance_idx" ON "memory_ring" USING btree ("profile_uuid","relevance_score");--> statement-breakpoint
CREATE INDEX "memory_sessions_profile_uuid_idx" ON "memory_sessions" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "memory_sessions_agent_uuid_idx" ON "memory_sessions" USING btree ("agent_uuid");--> statement-breakpoint
CREATE INDEX "memory_sessions_status_idx" ON "memory_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "memory_sessions_content_session_idx" ON "memory_sessions" USING btree ("content_session_id");--> statement-breakpoint
CREATE INDEX "memory_sessions_started_at_idx" ON "memory_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "memory_sessions_profile_agent_idx" ON "memory_sessions" USING btree ("profile_uuid","agent_uuid");