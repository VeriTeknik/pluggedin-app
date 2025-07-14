-- Create password_reset_tokens table
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expires" TIMESTAMP NOT NULL,
  PRIMARY KEY ("identifier", "token")
);

-- Update table constraints to ensure consistency with schema definition
ALTER TABLE "password_reset_tokens" 
  DROP CONSTRAINT IF EXISTS "password_reset_tokens_pkey";

-- Add primary key if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'password_reset_tokens_pkey' AND conrelid = 'password_reset_tokens'::regclass
  ) THEN
    ALTER TABLE "password_reset_tokens" 
      ADD PRIMARY KEY ("identifier", "token");
  END IF;
END
$$; 