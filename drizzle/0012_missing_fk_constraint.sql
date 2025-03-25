-- Add the missing foreign key constraint for active_profile_uuid
ALTER TABLE "projects" 
ADD CONSTRAINT "projects_active_profile_uuid_profiles_uuid_fk" 
FOREIGN KEY ("active_profile_uuid") 
REFERENCES "profiles"("uuid") 
ON DELETE SET NULL; 