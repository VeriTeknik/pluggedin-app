ALTER TABLE "profiles" ADD COLUMN "enabled_capabilities" text[] NOT NULL DEFAULT '{}'::text[];

-- Add index for faster capability lookups
CREATE INDEX "profiles_enabled_capabilities_idx" ON "profiles" USING GIN ("enabled_capabilities");
