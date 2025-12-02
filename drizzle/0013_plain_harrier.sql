CREATE TYPE "public"."language" AS ENUM('en', 'tr');--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "language" "language" DEFAULT 'en';