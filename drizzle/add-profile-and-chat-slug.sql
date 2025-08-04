-- Add bio and additional profile fields to users table if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS website VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS company VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS twitter_handle VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_handle VARCHAR(100);

-- Add slug field to embedded_chats table for short URLs
ALTER TABLE embedded_chats ADD COLUMN IF NOT EXISTS slug VARCHAR(100);

-- Create unique index on slug per user (username + slug combination must be unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_embedded_chats_slug ON embedded_chats(slug, project_uuid);

-- Add comment
COMMENT ON COLUMN embedded_chats.slug IS 'URL-friendly slug for accessing chat via /to/username/slug';
COMMENT ON COLUMN users.website IS 'User website URL';
COMMENT ON COLUMN users.location IS 'User location';
COMMENT ON COLUMN users.company IS 'User company/organization';
COMMENT ON COLUMN users.twitter_handle IS 'Twitter/X username without @';
COMMENT ON COLUMN users.github_handle IS 'GitHub username';