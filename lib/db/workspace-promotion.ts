/**
 * Promoting Workspaces to Hubs.
 *
 * Every unique constraint that made the alternative — merging the profiles
 * inside a Hub — expensive is keyed on profile_uuid. Promotion does not change
 * profile_uuid, so none of them can collide and no row of user data moves. In
 * particular mcp_servers.slug is untouched, which matters because slug is the
 * tool-name prefix ({slug}__{tool}) and renaming one silently invalidates any
 * saved instruction naming those tools.
 *
 * See docs/ops/workspace-promotion-plan.md.
 */

import { sql } from 'drizzle-orm';

import type { db as database } from '@/db';

type Db = typeof database;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;

export type PromotedWorkspace = {
  profileUuid: string;
  name: string;
  hubName: string;
  fromProjectUuid: string;
  toProjectUuid: string;
};

export type PromotionResult = {
  /** Secondary Workspaces that held no rows in any profile-scoped table. */
  deleted: string[];
  promoted: PromotedWorkspace[];
  /** docs is the only table carrying both profile_uuid and project_uuid. */
  docsRealigned: number;
  chunksRealigned: number;
};

/**
 * Every table keyed on a profile that has been looked at and accounted for.
 *
 * This is NOT what the code counts — see profileScopedTables, which asks the
 * database. It is a tripwire: a test asserts the live schema holds nothing
 * outside this list, so a table added later fails a test instead of silently
 * changing what "empty" means. Emptiness decides deletion, and a table missed
 * here would have deleted data.
 *
 * It deliberately lists more than a database built from drizzle/ will have.
 * Production carries four tables the migration chain does not create —
 * log_settings, notification_settings, syslog_settings and
 * user_server_favorites — so a hardcoded list cannot be used for counting
 * without breaking on one schema or the other.
 */
export const PROFILE_SCOPED_TABLES: readonly string[] = [
  'agents',
  'audit_logs',
  'clipboards',
  'collective_feedback',
  'custom_mcp_servers',
  'docs',
  'dream_consolidations',
  'embedded_chats',
  'fresh_memory',
  'individuation_snapshots',
  'log_retention_policies',
  'log_settings',
  'mcp_activity',
  'mcp_oauth_sessions',
  'mcp_servers',
  'mcp_sessions',
  'memory_ring',
  'memory_sessions',
  'notifications',
  'playground_settings',
  'server_installations',
  'shared_collections',
  'shared_mcp_servers',
  'system_logs',
  'user_server_favorites',
];

/**
 * Tables that carry profile_uuid but are not user data, so holding a row in one
 * does not make a Workspace "in use".
 *
 * workspace_promotions is this migration's own record of what it did. Counting
 * it would mean that after a rolled-back run every Workspace looks occupied and
 * none can ever be cleaned up again.
 */
export const NON_USER_DATA_TABLES: readonly string[] = ['workspace_promotions'];

export const ONE_WORKSPACE_PER_HUB_CONSTRAINT = 'profiles_project_uuid_unique';

type SecondaryWorkspace = {
  uuid: string;
  name: string;
  project_uuid: string;
  user_id: string;
  hub_name: string;
  used: number;
};

/**
 * The tables to count, asked of the database rather than remembered.
 *
 * A hardcoded list has drifted three times now: picked by hand, grepped out of
 * db/schema.ts, and — found while testing this — short by the four tables
 * production has that drizzle/ does not create. Every one of those failures
 * looked the same from outside: a Workspace reported empty when it was not.
 */
async function profileScopedTables(tx: Executor): Promise<string[]> {
  const { rows } = await tx.execute(sql`
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.column_name = 'profile_uuid'
    ORDER BY c.table_name
  `);
  return (rows as { table_name: string }[])
    .map((row) => row.table_name)
    .filter((table) => !NON_USER_DATA_TABLES.includes(table));
}

/** `count(*) + count(*) + …` across every profile-scoped table, for `s.uuid`. */
async function usageExpression(tx: Executor) {
  const tables = await profileScopedTables(tx);
  return sql.join(
    tables.map(
      (table) => sql`(SELECT count(*) FROM ${sql.identifier(table)} WHERE profile_uuid = s.uuid)`
    ),
    sql` + `
  );
}

/**
 * Deletes a Workspace only if it is still empty at the moment of deletion.
 *
 * The counts that decide deletion are taken once, at the start of the run, and
 * every profile-scoped table cascades when a profile is deleted. On a live
 * system a row written between the count and the DELETE would be destroyed by
 * that cascade, leaving no trace anywhere. Re-checking inside the DELETE closes
 * it: a row committed before this statement is visible and the delete does
 * nothing, and a writer racing after it blocks on the parent's key-share lock
 * and then fails loudly rather than losing the write.
 *
 * Returns false if the Workspace turned out not to be empty; the caller
 * promotes it instead.
 */
export async function deleteIfStillEmpty(tx: Executor, profileUuid: string): Promise<boolean> {
  const tables = await profileScopedTables(tx);
  const stillEmpty = sql.join(
    tables.map(
      (table) =>
        sql`NOT EXISTS (SELECT 1 FROM ${sql.identifier(table)} WHERE profile_uuid = ${profileUuid})`
    ),
    sql` AND `
  );

  const { rows } = await tx.execute(sql`
    DELETE FROM profiles WHERE uuid = ${profileUuid} AND ${stillEmpty} RETURNING uuid
  `);
  return rows.length > 0;
}

/**
 * Secondary Workspaces, with how many rows each holds across every
 * profile-scoped table. "Secondary" is every profile that is not the oldest in
 * its project, matching docs/ops/workspace-collapse-survey.sql.
 */
async function findSecondaryWorkspaces(tx: Executor): Promise<SecondaryWorkspace[]> {
  const used = await usageExpression(tx);

  const { rows } = await tx.execute(sql`
    WITH primary_profile AS (
      SELECT DISTINCT ON (project_uuid) project_uuid, uuid
      FROM profiles ORDER BY project_uuid, created_at
    ),
    secondary AS (
      SELECT f.uuid, f.name, f.project_uuid, f.created_at, p.user_id, p.name AS hub_name
      FROM profiles f
      JOIN projects p ON p.uuid = f.project_uuid
      LEFT JOIN primary_profile pp ON pp.uuid = f.uuid
      WHERE pp.uuid IS NULL
    )
    SELECT s.uuid, s.name, s.project_uuid, s.user_id, s.hub_name, (${used})::int AS used
    FROM secondary s
    ORDER BY s.created_at, s.uuid
  `);

  return rows as SecondaryWorkspace[];
}

/**
 * The Workspace's own name, unless the user already has a Hub called that — in
 * which case the Hubs dropdown would show two identical entries. There is no
 * unique constraint on projects.name, so this is legibility rather than
 * correctness, but two identical Hubs is a worse answer than a longer name.
 */
async function nameForNewHub(tx: Executor, workspace: SecondaryWorkspace): Promise<string> {
  const { rows } = await tx.execute(sql`
    SELECT 1 FROM projects WHERE user_id = ${workspace.user_id} AND name = ${workspace.name} LIMIT 1
  `);
  return rows.length > 0 ? `${workspace.hub_name} — ${workspace.name}` : workspace.name;
}

export type PromotionPlan = {
  secondaryWorkspaces: number;
  toPromote: number;
  toDelete: number;
  /** New Hubs whose name would collide with one the user already has. */
  nameClashes: number;
};

/**
 * What promoteWorkspacesToHubs would do, without doing it. The counts are
 * re-derived from the live database every time rather than read from a
 * document, because they drift: production gained two users and two Hubs
 * between the survey and the plan being written.
 */
export async function planWorkspacePromotion(db: Executor): Promise<PromotionPlan> {
  const secondaries = await findSecondaryWorkspaces(db);
  const holdingData = secondaries.filter((w) => w.used > 0);

  let nameClashes = 0;
  for (const workspace of holdingData) {
    if ((await nameForNewHub(db, workspace)) !== workspace.name) nameClashes += 1;
  }

  return {
    secondaryWorkspaces: secondaries.length,
    toPromote: holdingData.length,
    toDelete: secondaries.length - holdingData.length,
    nameClashes,
  };
}

/**
 * A Hub whose selected Workspace has just left it points at a profile that is
 * no longer inside it. Nothing in the schema prevents that — projects
 * .active_profile_uuid carries no foreign key — and the web UI reads it to
 * decide which Workspace you are looking at, so it has to be moved to one that
 * is still there.
 */
async function repointHubSelection(
  tx: Executor,
  projectUuid: string,
  departedProfileUuid: string
): Promise<void> {
  await tx.execute(sql`
    UPDATE projects
    SET active_profile_uuid = (
      SELECT uuid FROM profiles WHERE project_uuid = ${projectUuid} ORDER BY created_at LIMIT 1
    )
    WHERE uuid = ${projectUuid} AND active_profile_uuid = ${departedProfileUuid}
  `);
}

/** Puts back what repointHubSelection moved, from what promotion recorded. */
async function restoreHubSelection(
  tx: Executor,
  projectUuid: string,
  previousSelection: string | null
): Promise<void> {
  if (!previousSelection) return;
  await tx.execute(sql`
    UPDATE projects SET active_profile_uuid = ${previousSelection} WHERE uuid = ${projectUuid}
  `);
}

export type RollbackResult = {
  /** Promoted Workspaces put back under their original Hub. */
  restored: number;
  /** Empty Workspaces that had been deleted, recreated from their snapshot. */
  recreated: number;
  /** Hubs promotion had created, now removed. */
  hubsRemoved: number;
};

/**
 * Undoes promoteWorkspacesToHubs from what it recorded.
 *
 * Possible only because promotion moves no data: every row stayed keyed to its
 * profile, so putting the profile back under its old Hub is the whole of it.
 * The deleted Workspaces held no rows by definition, which is why recreating
 * the profile row is enough to restore them.
 */
export async function rollbackWorkspacePromotion(db: Db): Promise<RollbackResult> {
  return db.transaction(async (tx) => {
    // The constraint would reject putting two Workspaces back under one Hub,
    // which is precisely what a rollback does.
    await tx.execute(sql`
      ALTER TABLE profiles DROP CONSTRAINT IF EXISTS ${sql.identifier(ONE_WORKSPACE_PER_HUB_CONSTRAINT)}
    `);

    const { rows } = await tx.execute(sql`
      SELECT profile_uuid, action, from_project_uuid, to_project_uuid,
             from_project_active_profile_uuid, profile_snapshot
      FROM workspace_promotions ORDER BY id DESC
    `);

    const result: RollbackResult = { restored: 0, recreated: 0, hubsRemoved: 0 };

    for (const row of rows as {
      profile_uuid: string;
      action: string;
      from_project_uuid: string;
      to_project_uuid: string | null;
      from_project_active_profile_uuid: string | null;
      profile_snapshot: Record<string, unknown>;
    }[]) {
      if (row.action === 'deleted') {
        // Rebuilt from the whole snapshot rather than from a list of columns.
        // A list works right up until someone adds a column to profiles, at
        // which point the restore quietly stops being verbatim — the same drift
        // that has already cost this migration three corrections elsewhere.
        // jsonb_populate_record takes the row shape from the table itself, so
        // there is no list to fall out of date. The snapshot is a SELECT * of
        // the row as it stood, including its original project_uuid.
        await tx.execute(sql`
          INSERT INTO profiles
          SELECT * FROM jsonb_populate_record(
            NULL::profiles, ${JSON.stringify(row.profile_snapshot)}::jsonb
          )
          ON CONFLICT (uuid) DO NOTHING
        `);
        await restoreHubSelection(tx, row.from_project_uuid, row.from_project_active_profile_uuid);
        result.recreated += 1;
        continue;
      }

      await tx.execute(sql`
        UPDATE profiles SET project_uuid = ${row.from_project_uuid} WHERE uuid = ${row.profile_uuid}
      `);
      await tx.execute(sql`
        UPDATE docs SET project_uuid = ${row.from_project_uuid} WHERE profile_uuid = ${row.profile_uuid}
      `);
      await tx.execute(sql`
        UPDATE document_chunks SET project_uuid = ${row.from_project_uuid}
        WHERE document_uuid IN (SELECT uuid FROM docs WHERE profile_uuid = ${row.profile_uuid})
      `);
      result.restored += 1;

      if (row.to_project_uuid) {
        const removed = await tx.execute(sql`
          DELETE FROM projects WHERE uuid = ${row.to_project_uuid} RETURNING uuid
        `);
        result.hubsRemoved += removed.rows.length;
      }

      await restoreHubSelection(tx, row.from_project_uuid, row.from_project_active_profile_uuid);
    }

    await tx.execute(sql`DELETE FROM workspace_promotions`);
    return result;
  });
}


/**
 * Turns "a Hub has one Workspace" from a convention into something the database
 * refuses to violate. Run it after promoteWorkspacesToHubs; on its own it will
 * not force the issue, because silently deciding which of a user's two
 * Workspaces to discard is not a decision a constraint should make.
 */
export async function verifyOneWorkspacePerHub(db: Executor): Promise<boolean> {
  const { rows } = await db.execute(sql`
    SELECT 1 FROM pg_constraint WHERE conname = ${ONE_WORKSPACE_PER_HUB_CONSTRAINT}
  `);
  return rows.length > 0;
}

export async function enforceOneWorkspacePerHub(db: Executor): Promise<void> {
  // The migration takes this constraint when it can, so by the time the script
  // runs it may already be here. Idempotent rather than fatal.
  if (await verifyOneWorkspacePerHub(db)) return;

  const { rows } = await db.execute(sql`
    SELECT count(*)::int AS n FROM (
      SELECT project_uuid FROM profiles GROUP BY project_uuid HAVING count(*) > 1
    ) t
  `);
  const remaining = (rows[0] as { n: number }).n;
  if (remaining > 0) {
    throw new Error(
      `${remaining} Hub(s) still hold more than one Workspace. ` +
        'Run promoteWorkspacesToHubs first — enforcing the constraint now would ' +
        'fail on a duplicate key and tell you less about why.'
    );
  }

  await db.execute(sql`
    ALTER TABLE profiles
    ADD CONSTRAINT ${sql.identifier(ONE_WORKSPACE_PER_HUB_CONSTRAINT)} UNIQUE (project_uuid)
  `);
}

export async function promoteWorkspacesToHubs(db: Db): Promise<PromotionResult> {
  return db.transaction(async (tx) => {
    const secondaries = await findSecondaryWorkspaces(tx);

    const result: PromotionResult = {
      deleted: [],
      promoted: [],
      docsRealigned: 0,
      chunksRealigned: 0,
    };

    for (const workspace of secondaries) {
      // Recorded before the row is touched: after a DELETE there is nothing
      // left to snapshot, and the snapshot is the only way back.
      const snapshot = (
        await tx.execute(sql`SELECT * FROM profiles WHERE uuid = ${workspace.uuid}`)
      ).rows[0];
      const previousSelection = (
        await tx.execute(
          sql`SELECT active_profile_uuid FROM projects WHERE uuid = ${workspace.project_uuid}`
        )
      ).rows[0] as { active_profile_uuid: string | null };

      if (workspace.used === 0 && (await deleteIfStillEmpty(tx, workspace.uuid))) {
        await tx.execute(sql`
          INSERT INTO workspace_promotions
            (profile_uuid, action, from_project_uuid, to_project_uuid,
             from_project_active_profile_uuid, profile_snapshot)
          VALUES (${workspace.uuid}, 'deleted', ${workspace.project_uuid}, NULL,
                  ${previousSelection.active_profile_uuid}, ${JSON.stringify(snapshot)}::jsonb)
        `);
        await repointHubSelection(tx, workspace.project_uuid, workspace.uuid);
        result.deleted.push(workspace.uuid);
        continue;
      }

      // Either it held data all along, or it stopped being empty between the
      // count and here. Promoting is right in both cases and loses nothing.

      const hubName = await nameForNewHub(tx, workspace);

      const [{ uuid: newProjectUuid }] = (
        await tx.execute(sql`
          INSERT INTO projects (name, user_id, active_profile_uuid)
          VALUES (${hubName}, ${workspace.user_id}, ${workspace.uuid})
          RETURNING uuid
        `)
      ).rows as { uuid: string }[];

      await tx.execute(sql`
        UPDATE profiles SET project_uuid = ${newProjectUuid} WHERE uuid = ${workspace.uuid}
      `);

      // docs carries both keys, so its project_uuid has to follow the profile
      // to its new Hub, and document_chunks mirrors docs.
      const docs = await tx.execute(sql`
        UPDATE docs SET project_uuid = ${newProjectUuid}
        WHERE profile_uuid = ${workspace.uuid} AND project_uuid IS DISTINCT FROM ${newProjectUuid}
        RETURNING uuid
      `);
      const chunks = await tx.execute(sql`
        UPDATE document_chunks SET project_uuid = ${newProjectUuid}
        WHERE document_uuid IN (SELECT uuid FROM docs WHERE profile_uuid = ${workspace.uuid})
          AND project_uuid IS DISTINCT FROM ${newProjectUuid}
        RETURNING uuid
      `);
      result.docsRealigned += docs.rows.length;
      result.chunksRealigned += chunks.rows.length;

      await repointHubSelection(tx, workspace.project_uuid, workspace.uuid);

      await tx.execute(sql`
        INSERT INTO workspace_promotions
          (profile_uuid, action, from_project_uuid, to_project_uuid,
           from_project_active_profile_uuid, profile_snapshot)
        VALUES (${workspace.uuid}, 'promoted', ${workspace.project_uuid}, ${newProjectUuid},
                ${previousSelection.active_profile_uuid}, ${JSON.stringify(snapshot)}::jsonb)
      `);

      result.promoted.push({
        profileUuid: workspace.uuid,
        name: workspace.name,
        hubName,
        fromProjectUuid: workspace.project_uuid,
        toProjectUuid: newProjectUuid,
      });
    }

    return result;
  });
}
