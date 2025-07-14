DO $$ BEGIN
    CREATE TYPE "language" AS ENUM ('en', 'tr');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "language" "language" DEFAULT 'en';
