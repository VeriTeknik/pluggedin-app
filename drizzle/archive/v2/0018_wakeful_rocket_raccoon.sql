DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'nl' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'language')) THEN
        ALTER TYPE "public"."language" ADD VALUE 'nl';
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'zh' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'language')) THEN
        ALTER TYPE "public"."language" ADD VALUE 'zh';
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ja' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'language')) THEN
        ALTER TYPE "public"."language" ADD VALUE 'ja';
    END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'hi' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'language')) THEN
        ALTER TYPE "public"."language" ADD VALUE 'hi';
    END IF;
END $$;
