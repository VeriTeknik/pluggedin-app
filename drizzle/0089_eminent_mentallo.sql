ALTER TABLE "ai_models" ADD COLUMN "last_test_status" text;--> statement-breakpoint
ALTER TABLE "ai_models" ADD COLUMN "last_tested_at" timestamp with time zone;