ALTER TABLE "projects" ADD CONSTRAINT "projects_active_profile_uuid_profiles_uuid_fk" 
FOREIGN KEY ("active_profile_uuid") REFERENCES "profiles"("uuid") ON DELETE set null; 