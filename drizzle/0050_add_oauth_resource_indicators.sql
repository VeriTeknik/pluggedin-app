-- Add resource field to OAuth tables for RFC 8707 compliance
-- Resource Indicators for OAuth 2.0

-- Add resource field to oauth_authorization_codes table
ALTER TABLE oauth_authorization_codes 
ADD COLUMN IF NOT EXISTS resource TEXT;

-- Add resource field to oauth_tokens table  
ALTER TABLE oauth_tokens
ADD COLUMN IF NOT EXISTS resource TEXT;

-- Add index for resource lookups (optional, for performance)
CREATE INDEX IF NOT EXISTS oauth_authorization_codes_resource_idx 
ON oauth_authorization_codes(resource) 
WHERE resource IS NOT NULL;

CREATE INDEX IF NOT EXISTS oauth_tokens_resource_idx 
ON oauth_tokens(resource) 
WHERE resource IS NOT NULL;