ALTER TABLE "notifications" ADD COLUMN "severity" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "completed" boolean DEFAULT false NOT NULL;