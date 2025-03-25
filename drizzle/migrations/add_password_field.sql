-- Add password field to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password" text;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email"); 