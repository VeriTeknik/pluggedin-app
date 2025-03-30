ALTER TABLE "profiles" ADD COLUMN "enabled_capabilities" profile_capability[] NOT NULL DEFAULT '{}'::profile_capability[];

-- Add index for faster capability lookups
CREATE INDEX "profiles_enabled_capabilities_idx" ON "profiles" USING GIN ("enabled_capabilities");
