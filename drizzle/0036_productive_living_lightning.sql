ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "severity" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "completed" boolean DEFAULT false NOT NULL;