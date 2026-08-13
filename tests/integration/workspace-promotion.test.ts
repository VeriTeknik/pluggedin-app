import { randomUUID } from 'crypto';
import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Workspace promotion: giving every surviving profile its own project so
 * that a Hub has exactly one Workspace and the Workspace stops being an axis
 * anyone has to resolve.
 *
 * Requires a database. Set INTEGRATION_DATABASE_URL to a throwaway one:
 *
 *   docker exec <pg> psql -U pluggedin -d postgres -c 'CREATE DATABASE promo_it;'
 *   DATABASE_URL=postgresql://…/promo_it DATABASE_SSL=false pnpm db:migrate
 *   INTEGRATION_DATABASE_URL=postgresql://…/promo_it pnpm test tests/integration/workspace-promotion.test.ts
 *
 * Without it the suite skips rather than fails, matching
 * tests/integration/oauth-token-endpoint.test.ts.
 */

// Hoisted, because db/index.ts builds its pool the moment it is imported.
const { INTEGRATION_DATABASE_URL } = vi.hoisted(() => {
  const url = process.env.INTEGRATION_DATABASE_URL;
  if (url) {
    process.env.DATABASE_URL = url;
    process.env.DATABASE_SSL = 'false';
  }
  return { INTEGRATION_DATABASE_URL: url };
});

const describeIfDb = INTEGRATION_DATABASE_URL ? describe : describe.skip;

describeIfDb('workspace promotion', () => {
  let db: typeof import('@/db').db;
  let PROFILE_SCOPED_TABLES: readonly string[];
  let NON_USER_DATA_TABLES: readonly string[];
  let planWorkspacePromotion: typeof import('@/lib/db/workspace-promotion').planWorkspacePromotion;
  let deleteIfStillEmpty: typeof import('@/lib/db/workspace-promotion').deleteIfStillEmpty;
  let verifyOneWorkspacePerHub: typeof import('@/lib/db/workspace-promotion').verifyOneWorkspacePerHub;
  let promoteWorkspacesToHubs: typeof import('@/lib/db/workspace-promotion').promoteWorkspacesToHubs;
  let enforceOneWorkspacePerHub: typeof import('@/lib/db/workspace-promotion').enforceOneWorkspacePerHub;
  let rollbackWorkspacePromotion: typeof import('@/lib/db/workspace-promotion').rollbackWorkspacePromotion;

  beforeAll(async () => {
    ({ db } = await import('@/db'));
    ({
      PROFILE_SCOPED_TABLES,
      NON_USER_DATA_TABLES,
      planWorkspacePromotion,
      deleteIfStillEmpty,
      verifyOneWorkspacePerHub,
      promoteWorkspacesToHubs,
      enforceOneWorkspacePerHub,
      rollbackWorkspacePromotion,
    } = await import('@/lib/db/workspace-promotion'));
  });

  /**
   * promoteWorkspacesToHubs operates on the whole database, so leftovers from
   * an earlier test — or an earlier run, since this database persists — become
   * inputs to the next one. That is not hypothetical: a Workspace named BOOM
   * left behind by the atomicity test below was promoted into a real project by
   * a later test, and the run after that failed while setting up rather than
   * while asserting.
   */
  beforeEach(async () => {
    // workspace_promotions has no foreign keys — deliberately, so it survives
    // the rows it describes — which also means CASCADE does not reach it.
    await db.execute(sql`TRUNCATE users CASCADE`);
    await db.execute(sql`TRUNCATE workspace_promotions`);
    // The invariant is added by a later step, so tests that build pre-migration
    // state — several Workspaces under one Hub — need it absent.
    await db.execute(
      sql`ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_project_uuid_unique`
    );
  });

  /** A user with no projects. Each test gets its own so they cannot interfere. */
  async function makeUser(): Promise<string> {
    const id = `promo-${randomUUID()}`;
    await db.execute(sql`INSERT INTO users (id, email) VALUES (${id}, ${`${id}@example.test`})`);
    return id;
  }

  /** A Hub with its first Workspace, the way the app creates them. */
  async function makeHub(userId: string, hubName: string, workspaceName = 'Default Workspace') {
    const [{ uuid: projectUuid }] = (
      await db.execute(sql`
        INSERT INTO projects (name, user_id) VALUES (${hubName}, ${userId}) RETURNING uuid
      `)
    ).rows as { uuid: string }[];
    const profileUuid = await addWorkspace(projectUuid, workspaceName);
    await db.execute(sql`
      UPDATE projects SET active_profile_uuid = ${profileUuid} WHERE uuid = ${projectUuid}
    `);
    return { projectUuid, profileUuid };
  }

  /** A second (or third) Workspace under an existing Hub — the thing being removed. */
  async function addWorkspace(projectUuid: string, name: string): Promise<string> {
    const [{ uuid }] = (
      await db.execute(sql`
        INSERT INTO profiles (name, project_uuid) VALUES (${name}, ${projectUuid}) RETURNING uuid
      `)
    ).rows as { uuid: string }[];
    return uuid;
  }

  async function addServer(profileUuid: string, name: string, slug: string) {
    const [{ uuid }] = (
      await db.execute(sql`
        INSERT INTO mcp_servers (name, slug, profile_uuid)
        VALUES (${name}, ${slug}, ${profileUuid}) RETURNING uuid
      `)
    ).rows as { uuid: string }[];
    return uuid;
  }

  async function addDoc(userId: string, profileUuid: string, projectUuid: string, name: string) {
    const [{ uuid }] = (
      await db.execute(sql`
        INSERT INTO docs (user_id, profile_uuid, project_uuid, name, file_name, file_size, mime_type, file_path)
        VALUES (${userId}, ${profileUuid}, ${projectUuid}, ${name}, ${`${name}.txt`}, 10, 'text/plain', ${`/tmp/${name}.txt`})
        RETURNING uuid
      `)
    ).rows as { uuid: string }[];
    return uuid;
  }

  async function addChunk(docUuid: string, projectUuid: string) {
    await db.execute(sql`
      INSERT INTO document_chunks (document_uuid, project_uuid, chunk_index, chunk_text, zvec_vector_id)
      VALUES (${docUuid}, ${projectUuid}, 0, 'chunk', ${`vec-${randomUUID()}`})
    `);
  }

  async function profileRow(profileUuid: string) {
    const { rows } = await db.execute(sql`
      SELECT uuid, name, project_uuid FROM profiles WHERE uuid = ${profileUuid}
    `);
    return rows[0] as { uuid: string; name: string; project_uuid: string } | undefined;
  }

  async function projectRow(projectUuid: string) {
    const { rows } = await db.execute(sql`
      SELECT uuid, name, user_id, active_profile_uuid FROM projects WHERE uuid = ${projectUuid}
    `);
    return rows[0] as
      | { uuid: string; name: string; user_id: string; active_profile_uuid: string | null }
      | undefined;
  }

  describe('the table list this migration reasons about', () => {
    /**
     * This list has drifted twice already — once picked by hand, once derived
     * by grepping db/schema.ts — and each time the visible symptom was a
     * Workspace reported as empty when it was not. Emptiness decides whether a
     * Workspace is deleted, so a stale list here destroys data.
     *
     * The database is the only thing that knows which tables carry the column.
     */
    it('matches every table carrying profile_uuid in the live schema', async () => {
      const rows = await db.execute(sql`
        SELECT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
          AND c.column_name = 'profile_uuid'
      `);

      const live = (rows.rows as { table_name: string }[])
        .map((r) => r.table_name)
        .filter((t) => !NON_USER_DATA_TABLES.includes(t));

      // Subset, not equality: the constant deliberately lists tables a database
      // built from drizzle/ does not have, because production carries four the
      // migration chain never creates. What must not happen is a table in the
      // live schema that nobody has looked at — that one would change what
      // "empty" means, and empty decides deletion.
      const unreviewed = live.filter((t) => !PROFILE_SCOPED_TABLES.includes(t));
      expect(unreviewed).toEqual([]);
    });
  });

  describe('what happens to each Workspace', () => {
    it('leaves a Hub that already has exactly one Workspace untouched', async () => {
      const userId = await makeUser();
      const { projectUuid, profileUuid } = await makeHub(userId, 'Solo Hub');

      await promoteWorkspacesToHubs(db);

      expect(await profileRow(profileUuid)).toMatchObject({ project_uuid: projectUuid });
      const projects = await db.execute(
        sql`SELECT count(*)::int AS n FROM projects WHERE user_id = ${userId}`
      );
      expect((projects.rows[0] as { n: number }).n).toBe(1);
    });

    it('deletes a secondary Workspace that holds no rows anywhere', async () => {
      const userId = await makeUser();
      const { projectUuid } = await makeHub(userId, 'Hub');
      const leftover = await addWorkspace(projectUuid, 'Leftover');

      const result = await promoteWorkspacesToHubs(db);

      expect(await profileRow(leftover)).toBeUndefined();
      expect(result.deleted).toContain(leftover);
    });

    it('gives a secondary Workspace holding data its own Hub', async () => {
      const userId = await makeUser();
      const { projectUuid } = await makeHub(userId, 'Original Hub');
      const secondary = await addWorkspace(projectUuid, 'Second Workspace');
      await addServer(secondary, 'A server', 'a-server');

      await promoteWorkspacesToHubs(db);

      const profile = await profileRow(secondary);
      expect(profile).toBeDefined();
      expect(profile!.project_uuid).not.toBe(projectUuid);

      const newHub = await projectRow(profile!.project_uuid);
      expect(newHub).toMatchObject({
        user_id: userId,
        name: 'Second Workspace',
        active_profile_uuid: secondary,
      });
    });

    it('keeps the oldest Workspace as the Hub it was already under', async () => {
      const userId = await makeUser();
      const { projectUuid, profileUuid: oldest } = await makeHub(userId, 'Hub', 'First');
      const younger = await addWorkspace(projectUuid, 'Second');
      await addServer(younger, 'A server', 'a-server');

      await promoteWorkspacesToHubs(db);

      expect(await profileRow(oldest)).toMatchObject({ project_uuid: projectUuid });
      expect((await profileRow(younger))!.project_uuid).not.toBe(projectUuid);
    });
  });

  describe('what promotion must not disturb', () => {
    /**
     * The reason promotion was chosen over merging. Two servers sharing a slug
     * inside one Hub is the collision that made the merge expensive: slug is
     * the tool-name prefix ({slug}__{tool}), so resolving it by renaming one
     * side breaks every saved instruction naming that server's tools.
     */
    it('leaves colliding slugs alone instead of renaming one side', async () => {
      const userId = await makeUser();
      const { projectUuid, profileUuid: primary } = await makeHub(userId, 'Hub');
      const secondary = await addWorkspace(projectUuid, 'Second');
      const serverA = await addServer(primary, 'GitHub', 'github');
      const serverB = await addServer(secondary, 'GitHub', 'github');

      await promoteWorkspacesToHubs(db);

      const { rows } = await db.execute(sql`
        SELECT uuid, slug, profile_uuid FROM mcp_servers
        WHERE uuid IN (${serverA}, ${serverB}) ORDER BY uuid
      `);
      const servers = rows as { uuid: string; slug: string; profile_uuid: string }[];
      expect(servers).toHaveLength(2);
      expect(servers.every((s) => s.slug === 'github')).toBe(true);
      expect(servers.find((s) => s.uuid === serverA)!.profile_uuid).toBe(primary);
      expect(servers.find((s) => s.uuid === serverB)!.profile_uuid).toBe(secondary);
    });

    it('moves no row of profile-scoped data', async () => {
      const userId = await makeUser();
      const { projectUuid } = await makeHub(userId, 'Hub');
      const secondary = await addWorkspace(projectUuid, 'Second');
      const server = await addServer(secondary, 'Server', 'server');

      await promoteWorkspacesToHubs(db);

      const { rows } = await db.execute(
        sql`SELECT profile_uuid FROM mcp_servers WHERE uuid = ${server}`
      );
      expect((rows[0] as { profile_uuid: string }).profile_uuid).toBe(secondary);
    });
  });

  describe('docs, the only table keyed on both a profile and a project', () => {
    it('repoints a promoted Workspace’s docs at its new Hub', async () => {
      const userId = await makeUser();
      const { projectUuid } = await makeHub(userId, 'Hub');
      const secondary = await addWorkspace(projectUuid, 'Second');
      const doc = await addDoc(userId, secondary, projectUuid, 'note');

      const result = await promoteWorkspacesToHubs(db);

      const newProjectUuid = (await profileRow(secondary))!.project_uuid;
      const { rows } = await db.execute(
        sql`SELECT project_uuid FROM docs WHERE uuid = ${doc}`
      );
      expect((rows[0] as { project_uuid: string }).project_uuid).toBe(newProjectUuid);
      expect(result.docsRealigned).toBeGreaterThanOrEqual(1);
    });

    it('repoints the chunks of those docs too', async () => {
      const userId = await makeUser();
      const { projectUuid } = await makeHub(userId, 'Hub');
      const secondary = await addWorkspace(projectUuid, 'Second');
      const doc = await addDoc(userId, secondary, projectUuid, 'chunked');
      await addChunk(doc, projectUuid);

      const result = await promoteWorkspacesToHubs(db);

      const newProjectUuid = (await profileRow(secondary))!.project_uuid;
      const { rows } = await db.execute(
        sql`SELECT project_uuid FROM document_chunks WHERE document_uuid = ${doc}`
      );
      expect((rows[0] as { project_uuid: string }).project_uuid).toBe(newProjectUuid);
      expect(result.chunksRealigned).toBeGreaterThanOrEqual(1);
    });
  });

  describe('running it more than once, and running it badly', () => {
    it('promotes a Workspace only once', async () => {
      const userId = await makeUser();
      const { projectUuid } = await makeHub(userId, 'Hub');
      const secondary = await addWorkspace(projectUuid, 'Second');
      await addServer(secondary, 'Server', 'server');

      await promoteWorkspacesToHubs(db);
      const again = await promoteWorkspacesToHubs(db);

      expect(again.promoted.map((p) => p.profileUuid)).not.toContain(secondary);
      expect(again.deleted).not.toContain(secondary);
    });

    /**
     * A half-applied migration is the worst outcome available: some Workspaces
     * deleted, some promoted, and no way to tell which without re-deriving it.
     * The whole run has to be one transaction.
     */
    it('leaves the database untouched when one Workspace fails to promote', async () => {
      const userId = await makeUser();
      const { projectUuid } = await makeHub(userId, 'Hub');
      // Created first, so it is processed first: without a transaction its
      // deletion would already be committed by the time BOOM fails. Promotion
      // orders by created_at precisely so this is deterministic rather than a
      // coin flip on uuid ordering.
      const empty = await addWorkspace(projectUuid, 'Empty');
      const doomed = await addWorkspace(projectUuid, 'BOOM');
      await addServer(doomed, 'Server', 'server');

      await db.execute(
        sql`ALTER TABLE projects ADD CONSTRAINT projects_no_boom CHECK (name <> 'BOOM')`
      );
      try {
        await expect(promoteWorkspacesToHubs(db)).rejects.toThrow();

        expect(await profileRow(empty)).toBeDefined();
        const projects = await db.execute(
          sql`SELECT count(*)::int AS n FROM projects WHERE user_id = ${userId}`
        );
        expect((projects.rows[0] as { n: number }).n).toBe(1);
      } finally {
        await db.execute(sql`ALTER TABLE projects DROP CONSTRAINT projects_no_boom`);
      }
    });
  });

  /**
   * The point of the whole exercise. With one Workspace per Hub the connector's
   * "which Workspace did they mean" question has exactly one answer — and it is
   * the database that refuses a second, not a convention someone has to
   * remember. requireHubProfile used to pick the oldest profile while the web
   * UI read active_profile_uuid, and the two landed on different Workspaces.
   */
  describe('one Workspace per Hub, enforced by the database', () => {
    it('refuses a second Workspace once the invariant is in place', async () => {
      const userId = await makeUser();
      const { projectUuid } = await makeHub(userId, 'Hub');

      await enforceOneWorkspacePerHub(db);

      await expect(addWorkspace(projectUuid, 'Second')).rejects.toThrow();
    });

    it('refuses to enforce while a Hub still holds two Workspaces', async () => {
      const userId = await makeUser();
      const { projectUuid } = await makeHub(userId, 'Hub');
      await addWorkspace(projectUuid, 'Second');

      await expect(enforceOneWorkspacePerHub(db)).rejects.toThrow(/promoteWorkspacesToHubs/);
    });

    /**
     * The migration skips the constraint when duplicates exist rather than
     * failing, because drizzle-kit runs every pending migration in one
     * transaction and a raise there takes the audit table down with it. That
     * makes the script the only step that enforces — so running it twice, or
     * after a migration that already took the constraint, has to be safe.
     */
    it('is a no-op when the constraint is already there', async () => {
      const userId = await makeUser();
      await makeHub(userId, 'Hub');
      await enforceOneWorkspacePerHub(db);

      await expect(enforceOneWorkspacePerHub(db)).resolves.toBeUndefined();
    });

    it('reports the invariant missing so a deploy can check it landed', async () => {
      const userId = await makeUser();
      await makeHub(userId, 'Hub');

      expect(await verifyOneWorkspacePerHub(db)).toBe(false);
      await enforceOneWorkspacePerHub(db);
      expect(await verifyOneWorkspacePerHub(db)).toBe(true);
    });

    it('can be enforced immediately after promotion', async () => {
      const userId = await makeUser();
      const { projectUuid } = await makeHub(userId, 'Hub');
      const secondary = await addWorkspace(projectUuid, 'Second');
      await addServer(secondary, 'Server', 'server');
      await addWorkspace(projectUuid, 'Empty leftover');

      await promoteWorkspacesToHubs(db);

      await expect(enforceOneWorkspacePerHub(db)).resolves.toBeUndefined();
    });
  });

  /**
   * 1240 real users. A migration that cannot be undone is a migration you find
   * out was wrong from a support ticket. Promotion moves no data, so undoing it
   * is repointing profiles and dropping the Hubs it created — but only if it
   * wrote down what it did.
   */
  describe('undoing it', () => {
    it('puts a promoted Workspace back under the Hub it came from', async () => {
      const userId = await makeUser();
      const { projectUuid } = await makeHub(userId, 'Original');
      const secondary = await addWorkspace(projectUuid, 'Second');
      await addServer(secondary, 'Server', 'server');
      await promoteWorkspacesToHubs(db);

      await rollbackWorkspacePromotion(db);

      expect(await profileRow(secondary)).toMatchObject({ project_uuid: projectUuid });
    });

    it('removes the Hubs promotion created', async () => {
      const userId = await makeUser();
      const { projectUuid } = await makeHub(userId, 'Original');
      const secondary = await addWorkspace(projectUuid, 'Second');
      await addServer(secondary, 'Server', 'server');
      const { promoted } = await promoteWorkspacesToHubs(db);

      await rollbackWorkspacePromotion(db);

      expect(await projectRow(promoted[0].toProjectUuid)).toBeUndefined();
      const projects = await db.execute(
        sql`SELECT count(*)::int AS n FROM projects WHERE user_id = ${userId}`
      );
      expect((projects.rows[0] as { n: number }).n).toBe(1);
    });

    it('brings back the empty Workspaces it deleted, with their names', async () => {
      const userId = await makeUser();
      const { projectUuid } = await makeHub(userId, 'Hub');
      const leftover = await addWorkspace(projectUuid, 'Leftover');
      await promoteWorkspacesToHubs(db);
      expect(await profileRow(leftover)).toBeUndefined();

      await rollbackWorkspacePromotion(db);

      expect(await profileRow(leftover)).toMatchObject({
        uuid: leftover,
        name: 'Leftover',
        project_uuid: projectUuid,
      });
    });

    it('restores the docs it repointed', async () => {
      const userId = await makeUser();
      const { projectUuid } = await makeHub(userId, 'Hub');
      const secondary = await addWorkspace(projectUuid, 'Second');
      const doc = await addDoc(userId, secondary, projectUuid, 'note');
      await promoteWorkspacesToHubs(db);

      await rollbackWorkspacePromotion(db);

      const { rows } = await db.execute(sql`SELECT project_uuid FROM docs WHERE uuid = ${doc}`);
      expect((rows[0] as { project_uuid: string }).project_uuid).toBe(projectUuid);
    });
  });

  /**
   * Found by rehearsing on a copy of production, not by reasoning: 21 Hubs came
   * out of the first run pointing at a Workspace that no longer belonged to
   * them. projects.active_profile_uuid has no foreign key, so nothing stops it
   * dangling, and it is exactly what the web UI reads to decide which Workspace
   * you are looking at.
   */
  describe('the Hub’s selected Workspace', () => {
    it('repoints the old Hub when the Workspace it had selected is promoted away', async () => {
      const userId = await makeUser();
      const { projectUuid, profileUuid: primary } = await makeHub(userId, 'Hub');
      const secondary = await addWorkspace(projectUuid, 'Second');
      await addServer(secondary, 'Server', 'server');
      await db.execute(
        sql`UPDATE projects SET active_profile_uuid = ${secondary} WHERE uuid = ${projectUuid}`
      );

      await promoteWorkspacesToHubs(db);

      expect(await projectRow(projectUuid)).toMatchObject({ active_profile_uuid: primary });
    });

    it('repoints the old Hub when the Workspace it had selected is deleted as empty', async () => {
      const userId = await makeUser();
      const { projectUuid, profileUuid: primary } = await makeHub(userId, 'Hub');
      const leftover = await addWorkspace(projectUuid, 'Leftover');
      await db.execute(
        sql`UPDATE projects SET active_profile_uuid = ${leftover} WHERE uuid = ${projectUuid}`
      );

      await promoteWorkspacesToHubs(db);

      expect(await projectRow(projectUuid)).toMatchObject({ active_profile_uuid: primary });
    });

    it('leaves no Hub pointing outside itself', async () => {
      const userId = await makeUser();
      const { projectUuid } = await makeHub(userId, 'Hub');
      const secondary = await addWorkspace(projectUuid, 'Second');
      await addServer(secondary, 'Server', 'server');
      await db.execute(
        sql`UPDATE projects SET active_profile_uuid = ${secondary} WHERE uuid = ${projectUuid}`
      );

      await promoteWorkspacesToHubs(db);

      const { rows } = await db.execute(sql`
        SELECT count(*)::int AS n FROM projects p
        WHERE p.active_profile_uuid IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM profiles f
                          WHERE f.uuid = p.active_profile_uuid AND f.project_uuid = p.uuid)
      `);
      expect((rows[0] as { n: number }).n).toBe(0);
    });

    it('puts the old Hub’s selection back on rollback', async () => {
      const userId = await makeUser();
      const { projectUuid } = await makeHub(userId, 'Hub');
      const secondary = await addWorkspace(projectUuid, 'Second');
      await addServer(secondary, 'Server', 'server');
      await db.execute(
        sql`UPDATE projects SET active_profile_uuid = ${secondary} WHERE uuid = ${projectUuid}`
      );
      await promoteWorkspacesToHubs(db);

      await rollbackWorkspacePromotion(db);

      expect(await projectRow(projectUuid)).toMatchObject({ active_profile_uuid: secondary });
    });
  });

  /**
   * The counts that decide deletion are taken at the start of the run, and every
   * profile-scoped table cascades on profile deletion. On a live system a row
   * written between the count and the DELETE would be destroyed by that cascade
   * without appearing anywhere — the worst shape a bug can take here.
   *
   * So the delete re-checks emptiness itself. Either the new row is visible and
   * the Workspace is promoted instead, or the writer blocks on the parent row's
   * key-share lock and fails loudly rather than losing the write.
   */
  describe('a Workspace that stops being empty mid-run', () => {
    it('is not deleted on the strength of a stale count', async () => {
      const userId = await makeUser();
      const { projectUuid } = await makeHub(userId, 'Hub');
      const workspace = await addWorkspace(projectUuid, 'Counted as empty');
      await addServer(workspace, 'Arrived after the count', 'arrived');

      expect(await deleteIfStillEmpty(db, workspace)).toBe(false);
      expect(await profileRow(workspace)).toBeDefined();
    });

    it('is still deleted when it really is empty', async () => {
      const userId = await makeUser();
      const { projectUuid } = await makeHub(userId, 'Hub');
      const workspace = await addWorkspace(projectUuid, 'Genuinely empty');

      expect(await deleteIfStillEmpty(db, workspace)).toBe(true);
      expect(await profileRow(workspace)).toBeUndefined();
    });

    it('checks every profile-scoped table, not just the obvious ones', async () => {
      const userId = await makeUser();
      const { projectUuid } = await makeHub(userId, 'Hub');
      const workspace = await addWorkspace(projectUuid, 'Holds one audit row');
      // audit_logs was missing from the hand-picked list that shipped first.
      await db.execute(sql`
        INSERT INTO audit_logs (profile_uuid, type, action)
        VALUES (${workspace}, 'PROFILE_ACTION', 'test')
      `);

      expect(await deleteIfStillEmpty(db, workspace)).toBe(false);
    });
  });

  describe('looking before leaping', () => {
    it('reports what it would do without doing any of it', async () => {
      const userId = await makeUser();
      const { projectUuid } = await makeHub(userId, 'Hub');
      const keeper = await addWorkspace(projectUuid, 'Holds data');
      await addServer(keeper, 'Server', 'server');
      const leftover = await addWorkspace(projectUuid, 'Leftover');

      const plan = await planWorkspacePromotion(db);

      expect(plan.toPromote).toBe(1);
      expect(plan.toDelete).toBe(1);
      expect(await profileRow(keeper)).toMatchObject({ project_uuid: projectUuid });
      expect(await profileRow(leftover)).toBeDefined();
    });
  });

  describe('naming the new Hub', () => {
    it('disambiguates when the Workspace name already names one of the user’s Hubs', async () => {
      const userId = await makeUser();
      const { projectUuid } = await makeHub(userId, 'Research');
      const secondary = await addWorkspace(projectUuid, 'Research');
      await addServer(secondary, 'Server', 'server');

      await promoteWorkspacesToHubs(db);

      const newHub = await projectRow((await profileRow(secondary))!.project_uuid);
      expect(newHub!.name).toBe('Research — Research');
    });
  });
});
