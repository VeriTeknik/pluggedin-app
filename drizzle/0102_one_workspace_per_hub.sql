-- One Workspace per Hub.
--
-- Deliberately skips rather than fails when a Hub still holds two Workspaces.
--
-- drizzle-kit applies every pending migration in a single transaction, so a
-- migration that raises here takes 0101 down with it and the promotion script
-- has nowhere to record what it did — which is how the ordering deadlocks:
-- the constraint needs the promotion to have happened, the promotion needs the
-- audit table, and the audit table ships in the same transaction as the
-- constraint. Verified against a copy of production, not reasoned about.
--
-- So this migration takes the constraint when it can, and scripts/promote-
-- workspaces.ts takes it otherwise. That script's enforceOneWorkspacePerHub is
-- the loud step: it refuses, with a count and an instruction, if any Hub still
-- holds two Workspaces. Run `tsx scripts/promote-workspaces.ts --verify` after
-- deploying to confirm the invariant actually landed.
DO $$
DECLARE
  duplicate_hubs int;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_project_uuid_unique') THEN
    RAISE NOTICE 'profiles_project_uuid_unique is already present; nothing to do.';
    RETURN;
  END IF;

  SELECT count(*) INTO duplicate_hubs
  FROM (SELECT project_uuid FROM profiles GROUP BY project_uuid HAVING count(*) > 1) t;

  IF duplicate_hubs > 0 THEN
    RAISE WARNING
      'Skipping profiles_project_uuid_unique: % Hub(s) still hold more than one '
      'Workspace. Run scripts/promote-workspaces.ts --execute, then '
      '--verify. See docs/ops/workspace-promotion-plan.md.', duplicate_hubs;
    RETURN;
  END IF;

  ALTER TABLE "profiles" ADD CONSTRAINT "profiles_project_uuid_unique" UNIQUE("project_uuid");
END $$;
