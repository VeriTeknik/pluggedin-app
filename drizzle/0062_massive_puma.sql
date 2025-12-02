-- Add show_workspace_ui column to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name = 'show_workspace_ui'
  ) THEN
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "show_workspace_ui" boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Enable workspace UI for users with multiple profiles
UPDATE users SET show_workspace_ui = true
WHERE id IN (
  SELECT DISTINCT u.id
  FROM users u
  JOIN projects p ON u.id = p.user_id
  JOIN profiles pr ON p.uuid = pr.project_uuid
  GROUP BY u.id
  HAVING COUNT(DISTINCT pr.uuid) > 1
);