CREATE TYPE "public"."language" AS ENUM('en', 'tr');--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "language" "language" DEFAULT 'en';