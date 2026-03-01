CREATE TABLE "collective_contributions" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern_uuid" uuid NOT NULL,
	"profile_hash" text NOT NULL,
	"source_ring_uuid" uuid,
	"success_score" real,
	"ring_type" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collective_contributions_pattern_profile_unique" UNIQUE("pattern_uuid","profile_hash")
);
--> statement-breakpoint
CREATE TABLE "collective_feedback" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern_uuid" uuid NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"rating" integer NOT NULL,
	"feedback_type" varchar(30) NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collective_feedback_pattern_profile_unique" UNIQUE("pattern_uuid","profile_uuid")
);
--> statement-breakpoint
ALTER TABLE "collective_contributions" ADD CONSTRAINT "collective_contributions_pattern_uuid_gut_patterns_uuid_fk" FOREIGN KEY ("pattern_uuid") REFERENCES "public"."gut_patterns"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collective_feedback" ADD CONSTRAINT "collective_feedback_pattern_uuid_gut_patterns_uuid_fk" FOREIGN KEY ("pattern_uuid") REFERENCES "public"."gut_patterns"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collective_feedback" ADD CONSTRAINT "collective_feedback_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collective_contributions_pattern_uuid_idx" ON "collective_contributions" USING btree ("pattern_uuid");--> statement-breakpoint
CREATE INDEX "collective_contributions_profile_hash_idx" ON "collective_contributions" USING btree ("profile_hash");--> statement-breakpoint
CREATE INDEX "collective_feedback_pattern_uuid_idx" ON "collective_feedback" USING btree ("pattern_uuid");--> statement-breakpoint
CREATE INDEX "collective_feedback_profile_uuid_idx" ON "collective_feedback" USING btree ("profile_uuid");