ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "language" "language" DEFAULT 'en';--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "last_used" timestamp with time zone;