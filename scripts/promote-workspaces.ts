/**
 * Promote Workspaces to Hubs — see docs/ops/workspace-promotion-plan.md.
 *
 *   tsx scripts/promote-workspaces.ts             # report only, changes nothing
 *   tsx scripts/promote-workspaces.ts --execute   # promote, then lock the invariant in
 *   tsx scripts/promote-workspaces.ts --rollback  # undo it from what it recorded
 *
 * Reporting is the default because the counts drift — production gained two
 * users between the survey and the plan — and the numbers you act on should be
 * the ones the database holds now, not the ones a document remembers.
 */

import 'dotenv/config';

import { db } from '@/db';
import {
  enforceOneWorkspacePerHub,
  planWorkspacePromotion,
  promoteWorkspacesToHubs,
  rollbackWorkspacePromotion,
  verifyOneWorkspacePerHub,
} from '@/lib/db/workspace-promotion';

function targetDescription(): string {
  const url = process.env.DATABASE_URL ?? '';
  // Never print the URL itself: it carries the password.
  const database = url.replace(/^.*\//, '').replace(/\?.*$/, '');
  return database || '(unknown)';
}

async function main() {
  const mode = process.argv.includes('--rollback')
    ? 'rollback'
    : process.argv.includes('--verify')
      ? 'verify'
      : process.argv.includes('--execute')
        ? 'execute'
        : 'report';

  console.log(`Database: ${targetDescription()}`);

  if (mode === 'verify') {
    // Migration 0102 skips the constraint rather than failing, so "migrations
    // applied" does not mean the invariant landed. This is the check that says.
    const present = await verifyOneWorkspacePerHub(db);
    const plan = await planWorkspacePromotion(db);
    console.log(
      present
        ? 'One Workspace per Hub is enforced by the database.'
        : 'NOT ENFORCED: profiles_project_uuid_unique is missing.'
    );
    if (!present || plan.secondaryWorkspaces > 0) {
      console.error(`${plan.secondaryWorkspaces} secondary Workspace(s) remain.`);
      process.exitCode = 1;
    }
    return;
  }

  if (mode === 'rollback') {
    const result = await rollbackWorkspacePromotion(db);
    console.log(
      `Rolled back: ${result.restored} Workspace(s) returned to their original Hub, ` +
        `${result.recreated} recreated, ${result.hubsRemoved} Hub(s) removed.`
    );
    return;
  }

  const plan = await planWorkspacePromotion(db);
  console.log(
    `${plan.secondaryWorkspaces} secondary Workspace(s): ` +
      `${plan.toPromote} to promote, ${plan.toDelete} empty and to be deleted, ` +
      `${plan.nameClashes} needing a disambiguated Hub name.`
  );

  if (mode === 'report') {
    console.log('Nothing changed. Re-run with --execute to apply.');
    return;
  }

  const result = await promoteWorkspacesToHubs(db);
  console.log(
    `Promoted ${result.promoted.length}, deleted ${result.deleted.length}, ` +
      `realigned ${result.docsRealigned} doc(s) and ${result.chunksRealigned} chunk(s).`
  );

  await enforceOneWorkspacePerHub(db);
  console.log('One Workspace per Hub is now enforced by the database.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
