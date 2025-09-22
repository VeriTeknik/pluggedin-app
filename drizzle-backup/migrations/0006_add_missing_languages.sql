-- Add missing language values to the enum
-- The existing enum only has 'en' and 'tr', but the application supports 6 languages

-- PostgreSQL doesn't allow direct modification of enums, so we need to:
-- 1. Create a new enum with all values
-- 2. Convert the column to use the new enum
-- 3. Drop the old enum
-- 4. Rename the new enum

DO $$ 
BEGIN
    -- Create new enum with all supported languages
    CREATE TYPE "language_new" AS ENUM ('en', 'tr', 'zh', 'hi', 'ja', 'nl');
    
    -- Update profiles table to use new enum
    ALTER TABLE "profiles" 
    ALTER COLUMN "language" TYPE "language_new" 
    USING "language"::text::"language_new";
    
    -- Update users table to use new enum (if it has language column)
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'language'
    ) THEN
        ALTER TABLE "users" 
        ALTER COLUMN "language" TYPE "language_new" 
        USING "language"::text::"language_new";
    END IF;
    
    -- Drop old enum
    DROP TYPE "language";
    
    -- Rename new enum to original name
    ALTER TYPE "language_new" RENAME TO "language";
    
EXCEPTION
    WHEN duplicate_object THEN 
        -- If the enum already has all values, do nothing
        null;
END $$;