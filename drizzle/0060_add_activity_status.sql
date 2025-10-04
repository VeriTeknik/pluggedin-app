-- Add status tracking to mcp_activity table for success/failure rates
ALTER TABLE mcp_activity
ADD COLUMN IF NOT EXISTS status text DEFAULT 'success';

-- Add error message for debugging failed calls
ALTER TABLE mcp_activity
ADD COLUMN IF NOT EXISTS error_message text;

-- Add index for efficient analytics queries
CREATE INDEX IF NOT EXISTS idx_profile_action_status
ON mcp_activity(profile_uuid, action, status);

-- Add comment explaining status values
COMMENT ON COLUMN mcp_activity.status IS 'Status of the activity: success, error, or timeout';
COMMENT ON COLUMN mcp_activity.error_message IS 'Error message for failed activities';