-- Add composite indexes for performance optimization

-- 1. Composite index for shared_mcp_servers queries that filter by is_public and join with profile_uuid
-- This helps queries in search/route.ts and shared-content.ts
CREATE INDEX IF NOT EXISTS idx_shared_mcp_servers_public_profile 
ON shared_mcp_servers(is_public, profile_uuid) 
WHERE is_public = true;

-- 2. Composite index for shared_mcp_servers queries that order by created_at
CREATE INDEX IF NOT EXISTS idx_shared_mcp_servers_public_created 
ON shared_mcp_servers(is_public, created_at DESC) 
WHERE is_public = true;

-- 3. Composite index for server_installations frequently queried together
CREATE INDEX IF NOT EXISTS idx_server_installations_profile_server 
ON server_installations(profile_uuid, server_uuid);

-- 4. Composite index for mcp_servers queries by profile and status
CREATE INDEX IF NOT EXISTS idx_mcp_servers_profile_status 
ON mcp_servers(profile_uuid, status);

-- 5. Composite index for notifications queries
CREATE INDEX IF NOT EXISTS idx_notifications_profile_read_created 
ON notifications(profile_uuid, read, created_at DESC);

-- 6. Composite index for audit_logs queries  
CREATE INDEX IF NOT EXISTS idx_audit_logs_profile_type_created
ON audit_logs(profile_uuid, type, created_at DESC);

-- 7. Composite index for followers table for user relationship queries
CREATE INDEX IF NOT EXISTS idx_followers_followed_follower
ON followers(followed_user_id, follower_user_id);

-- 8. Composite index for search cache efficiency
CREATE INDEX IF NOT EXISTS idx_search_cache_source_query_expires
ON search_cache(source, query, expires_at);

-- 9. Composite index for registry servers claimed lookup
CREATE INDEX IF NOT EXISTS idx_registry_servers_claimed_published
ON registry_servers(claimed_by_user_id, is_published)
WHERE claimed_by_user_id IS NOT NULL;

-- 10. Composite index for shared collections
CREATE INDEX IF NOT EXISTS idx_shared_collections_public_profile
ON shared_collections(is_public, profile_uuid)
WHERE is_public = true;