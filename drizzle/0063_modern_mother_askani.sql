-- Performance optimization for show_workspace_ui column
-- This index is crucial for efficient filtering of users with/without workspace UI access
-- Expected queries will filter on show_workspace_ui=true (minority of users)
-- B-tree index is appropriate for boolean columns with selective filtering
CREATE INDEX IF NOT EXISTS "users_show_workspace_ui_idx" ON "users" USING btree ("show_workspace_ui");