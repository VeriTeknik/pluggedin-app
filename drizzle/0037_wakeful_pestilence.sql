-- Step 1: Add the column as nullable first
ALTER TABLE "docs" ADD COLUMN "profile_uuid" uuid;

-- Step 2: Populate existing documents with profile_uuid
-- For each user, assign their existing documents to their active profile (or first profile if no active one)
UPDATE "docs" SET "profile_uuid" = (
  SELECT COALESCE(
    -- Try to get active profile first
    (SELECT "active_profile_uuid" FROM "projects" WHERE "user_id" = "docs"."user_id" LIMIT 1),
    -- If no active profile, get the first profile for this user
    (SELECT "profiles"."uuid" FROM "profiles" 
     JOIN "projects" ON "profiles"."project_uuid" = "projects"."uuid" 
     WHERE "projects"."user_id" = "docs"."user_id" 
     ORDER BY "profiles"."created_at" ASC 
     LIMIT 1)
  )
);

-- Step 3: For any documents that still don't have a profile_uuid (edge case), 
-- create a default profile and assign them to it
DO $$
DECLARE
    user_record RECORD;
    default_profile_uuid uuid;
    project_uuid uuid;
BEGIN
    -- Find users with documents that have no profile_uuid
    FOR user_record IN 
        SELECT DISTINCT "user_id" 
        FROM "docs" 
        WHERE "profile_uuid" IS NULL
    LOOP
        -- Get or create a project for this user
        SELECT "uuid" INTO project_uuid
        FROM "projects" 
        WHERE "user_id" = user_record.user_id 
        LIMIT 1;
        
        -- If no project exists, create one
        IF project_uuid IS NULL THEN
            INSERT INTO "projects" ("user_id", "name") 
            VALUES (user_record.user_id, 'Default Project')
            RETURNING "uuid" INTO project_uuid;
        END IF;
        
        -- Create a default profile for this user
        INSERT INTO "profiles" ("name", "project_uuid") 
        VALUES ('Default Workspace', project_uuid)
        RETURNING "uuid" INTO default_profile_uuid;
        
        -- Update documents to use this profile
        UPDATE "docs" 
        SET "profile_uuid" = default_profile_uuid 
        WHERE "user_id" = user_record.user_id AND "profile_uuid" IS NULL;
        
        -- Set this as the active profile if none exists
        UPDATE "projects" 
        SET "active_profile_uuid" = default_profile_uuid 
        WHERE "uuid" = project_uuid AND "active_profile_uuid" IS NULL;
    END LOOP;
END $$;

-- Step 4: Now make the column NOT NULL
ALTER TABLE "docs" ALTER COLUMN "profile_uuid" SET NOT NULL;

-- Step 5: Add the foreign key constraint
ALTER TABLE "docs" ADD CONSTRAINT "docs_profile_uuid_profiles_uuid_fk" 
FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;

-- Step 6: Add the index
CREATE INDEX "docs_profile_uuid_idx" ON "docs" USING btree ("profile_uuid");