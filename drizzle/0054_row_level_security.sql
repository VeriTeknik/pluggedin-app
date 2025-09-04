-- Row-Level Security (RLS) Implementation
-- This migration enables RLS for multi-tenant data isolation

-- Note: RLS requires a way to identify the current user in the database session
-- This is typically done by setting a session variable with the user_id
-- Example: SET LOCAL app.current_user_id = 'user-uuid';

-- 1. Enable RLS on sensitive tables
ALTER TABLE mcp_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_collections ENABLE ROW LEVEL SECURITY;

-- 2. Create a function to get current user ID from session
CREATE OR REPLACE FUNCTION current_user_id() 
RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::TEXT;
$$ LANGUAGE SQL SECURITY DEFINER;

-- 3. Create RLS policies for projects table
-- Users can only see their own projects
CREATE POLICY projects_select_policy ON projects
  FOR SELECT
  USING (user_id = current_user_id());

CREATE POLICY projects_insert_policy ON projects
  FOR INSERT
  WITH CHECK (user_id = current_user_id());

CREATE POLICY projects_update_policy ON projects
  FOR UPDATE
  USING (user_id = current_user_id())
  WITH CHECK (user_id = current_user_id());

CREATE POLICY projects_delete_policy ON projects
  FOR DELETE
  USING (user_id = current_user_id());

-- 4. Create RLS policies for profiles table
-- Users can only access profiles belonging to their projects
CREATE POLICY profiles_select_policy ON profiles
  FOR SELECT
  USING (
    project_uuid IN (
      SELECT uuid FROM projects WHERE user_id = current_user_id()
    )
  );

CREATE POLICY profiles_insert_policy ON profiles
  FOR INSERT
  WITH CHECK (
    project_uuid IN (
      SELECT uuid FROM projects WHERE user_id = current_user_id()
    )
  );

CREATE POLICY profiles_update_policy ON profiles
  FOR UPDATE
  USING (
    project_uuid IN (
      SELECT uuid FROM projects WHERE user_id = current_user_id()
    )
  )
  WITH CHECK (
    project_uuid IN (
      SELECT uuid FROM projects WHERE user_id = current_user_id()
    )
  );

CREATE POLICY profiles_delete_policy ON profiles
  FOR DELETE
  USING (
    project_uuid IN (
      SELECT uuid FROM projects WHERE user_id = current_user_id()
    )
  );

-- 5. Create RLS policies for mcp_servers table
-- Users can only access servers belonging to their profiles
CREATE POLICY mcp_servers_select_policy ON mcp_servers
  FOR SELECT
  USING (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  );

CREATE POLICY mcp_servers_insert_policy ON mcp_servers
  FOR INSERT
  WITH CHECK (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  );

CREATE POLICY mcp_servers_update_policy ON mcp_servers
  FOR UPDATE
  USING (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  )
  WITH CHECK (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  );

CREATE POLICY mcp_servers_delete_policy ON mcp_servers
  FOR DELETE
  USING (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  );

-- 6. Create RLS policies for api_keys table
CREATE POLICY api_keys_select_policy ON api_keys
  FOR SELECT
  USING (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  );

CREATE POLICY api_keys_insert_policy ON api_keys
  FOR INSERT
  WITH CHECK (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  );

CREATE POLICY api_keys_update_policy ON api_keys
  FOR UPDATE
  USING (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  )
  WITH CHECK (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  );

CREATE POLICY api_keys_delete_policy ON api_keys
  FOR DELETE
  USING (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  );

-- 7. Create RLS policies for docs table (documents)
CREATE POLICY docs_select_policy ON docs
  FOR SELECT
  USING (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
    OR visibility = 'public' -- Allow reading public documents
  );

CREATE POLICY docs_insert_policy ON docs
  FOR INSERT
  WITH CHECK (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  );

CREATE POLICY docs_update_policy ON docs
  FOR UPDATE
  USING (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  )
  WITH CHECK (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  );

CREATE POLICY docs_delete_policy ON docs
  FOR DELETE
  USING (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  );

-- 8. Create RLS policies for shared_servers table
-- Users can see public shared servers or their own
CREATE POLICY shared_servers_select_policy ON shared_servers
  FOR SELECT
  USING (
    is_public = true
    OR profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  );

CREATE POLICY shared_servers_insert_policy ON shared_servers
  FOR INSERT
  WITH CHECK (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  );

CREATE POLICY shared_servers_update_policy ON shared_servers
  FOR UPDATE
  USING (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  )
  WITH CHECK (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  );

CREATE POLICY shared_servers_delete_policy ON shared_servers
  FOR DELETE
  USING (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  );

-- 9. Create RLS policies for shared_collections table
CREATE POLICY shared_collections_select_policy ON shared_collections
  FOR SELECT
  USING (
    is_public = true
    OR profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  );

CREATE POLICY shared_collections_insert_policy ON shared_collections
  FOR INSERT
  WITH CHECK (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  );

CREATE POLICY shared_collections_update_policy ON shared_collections
  FOR UPDATE
  USING (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  )
  WITH CHECK (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  );

CREATE POLICY shared_collections_delete_policy ON shared_collections
  FOR DELETE
  USING (
    profile_uuid IN (
      SELECT p.uuid FROM profiles p
      JOIN projects pr ON p.project_uuid = pr.uuid
      WHERE pr.user_id = current_user_id()
    )
  );

-- Comments for documentation
COMMENT ON POLICY projects_select_policy ON projects IS 'Users can only see their own projects';
COMMENT ON POLICY profiles_select_policy ON profiles IS 'Users can only see profiles in their projects';
COMMENT ON POLICY mcp_servers_select_policy ON mcp_servers IS 'Users can only see servers in their profiles';
COMMENT ON POLICY api_keys_select_policy ON api_keys IS 'Users can only see API keys in their profiles';
COMMENT ON POLICY docs_select_policy ON docs IS 'Users can see their own docs or public docs';
COMMENT ON POLICY shared_servers_select_policy ON shared_servers IS 'Users can see public servers or their own';
COMMENT ON POLICY shared_collections_select_policy ON shared_collections IS 'Users can see public collections or their own';

-- Note: To use RLS in your application, you need to set the user ID for each database session:
-- Example in your application code:
-- await db.execute(sql`SET LOCAL app.current_user_id = ${userId}`);
-- This should be done at the beginning of each request/transaction