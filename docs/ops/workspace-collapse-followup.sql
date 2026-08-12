-- Follow-up survey: the two questions the first one could not answer.
--
-- READ ONLY. Every statement is a SELECT.
--
--   psql "$DATABASE_URL" -f workspace-collapse-followup.sql
--
-- The first survey used users.last_login_at as an activity signal. It is not
-- one in this database: 68 of 1238 users have it populated, and only 3 of the
-- 70 with workspace UI enabled have any login recorded. Reading that zero as
-- "nobody uses Workspaces" would have been wrong, so this asks the same
-- question with timestamps that *are* written — the data's own created_at.
--
-- Two things are still open after survey one:
--
--   1. Of the 37 secondary Workspaces holding data, which are live and which
--      are fossils? A fossil can be merged without anyone noticing.
--
--   2. In each of the 25 slug collisions, which side is dead? This matters
--      more than it looks. slug is the tool-name prefix — tools are exposed as
--      `{slug}__{tool}` — so renaming one renames every tool that server
--      offers. A user with saved instructions calling `github__create_issue`
--      would silently be calling a tool that no longer exists. Renaming the
--      dead side of each pair costs nothing; renaming the live side breaks
--      someone's setup.

\echo '=================================================='
\echo '1. Are the non-empty secondary Workspaces alive?'
\echo '=================================================='
\echo 'Most recent activity per secondary Workspace, from data rather than'
\echo 'logins. A Workspace whose newest row is old is a fossil.'

WITH primary_profile AS (
  SELECT DISTINCT ON (project_uuid) project_uuid, uuid
  FROM profiles ORDER BY project_uuid, created_at
),
secondary AS (
  SELECT pf.uuid, pf.name, pf.project_uuid
  FROM profiles pf
  LEFT JOIN primary_profile pp ON pp.uuid = pf.uuid
  WHERE pp.uuid IS NULL
),
last_seen AS (
  SELECT s.uuid, s.name,
    GREATEST(
      COALESCE((SELECT max(created_at) FROM agents                  WHERE profile_uuid = s.uuid), 'epoch'),
      COALESCE((SELECT max(created_at) FROM audit_logs              WHERE profile_uuid = s.uuid), 'epoch'),
      COALESCE((SELECT max(created_at) FROM clipboards              WHERE profile_uuid = s.uuid), 'epoch'),
      COALESCE((SELECT max(created_at) FROM collective_feedback     WHERE profile_uuid = s.uuid), 'epoch'),
      COALESCE((SELECT max(created_at) FROM custom_mcp_servers      WHERE profile_uuid = s.uuid), 'epoch'),
      COALESCE((SELECT max(created_at) FROM docs                    WHERE profile_uuid = s.uuid), 'epoch'),
      COALESCE((SELECT max(created_at) FROM dream_consolidations    WHERE profile_uuid = s.uuid), 'epoch'),
      COALESCE((SELECT max(created_at) FROM embedded_chats          WHERE profile_uuid = s.uuid), 'epoch'),
      COALESCE((SELECT max(created_at) FROM fresh_memory            WHERE profile_uuid = s.uuid), 'epoch'),
      COALESCE((SELECT max(snapshot_date) FROM individuation_snapshots WHERE profile_uuid = s.uuid), 'epoch'),
      COALESCE((SELECT max(created_at) FROM log_retention_policies  WHERE profile_uuid = s.uuid), 'epoch'),
      COALESCE((SELECT max(created_at) FROM mcp_activity            WHERE profile_uuid = s.uuid), 'epoch'),
      COALESCE((SELECT max(created_at) FROM mcp_oauth_sessions      WHERE profile_uuid = s.uuid), 'epoch'),
      COALESCE((SELECT max(created_at) FROM mcp_servers             WHERE profile_uuid = s.uuid), 'epoch'),
      COALESCE((SELECT max(created_at) FROM mcp_sessions            WHERE profile_uuid = s.uuid), 'epoch'),
      COALESCE((SELECT max(created_at) FROM memory_ring             WHERE profile_uuid = s.uuid), 'epoch'),
      COALESCE((SELECT max(created_at) FROM memory_sessions         WHERE profile_uuid = s.uuid), 'epoch'),
      COALESCE((SELECT max(created_at) FROM notifications           WHERE profile_uuid = s.uuid), 'epoch'),
      COALESCE((SELECT max(created_at) FROM playground_settings     WHERE profile_uuid = s.uuid), 'epoch'),
      COALESCE((SELECT max(created_at) FROM server_installations    WHERE profile_uuid = s.uuid), 'epoch'),
      COALESCE((SELECT max(created_at) FROM shared_collections      WHERE profile_uuid = s.uuid), 'epoch'),
      COALESCE((SELECT max(created_at) FROM shared_mcp_servers      WHERE profile_uuid = s.uuid), 'epoch')
    ) AS newest_row
  FROM secondary s
)
SELECT
  count(*)                                                          AS non_empty_secondaries,
  count(*) FILTER (WHERE newest_row > now() - interval '90 days')   AS active_90d,
  count(*) FILTER (WHERE newest_row > now() - interval '180 days')  AS active_180d,
  count(*) FILTER (WHERE newest_row > now() - interval '365 days')  AS active_365d,
  min(newest_row)                                                   AS oldest,
  max(newest_row)                                                   AS most_recent
FROM last_seen
WHERE newest_row > 'epoch';

\echo ''
\echo 'The live ones, if any — these are the merges someone would notice.'

WITH primary_profile AS (
  SELECT DISTINCT ON (project_uuid) project_uuid, uuid
  FROM profiles ORDER BY project_uuid, created_at
),
secondary AS (
  SELECT pf.uuid, pf.name, pf.project_uuid
  FROM profiles pf
  LEFT JOIN primary_profile pp ON pp.uuid = pf.uuid
  WHERE pp.uuid IS NULL
)
SELECT
  s.name                                                                AS workspace,
  (SELECT count(*) FROM mcp_servers   WHERE profile_uuid = s.uuid)      AS servers,
  (SELECT count(*) FROM docs          WHERE profile_uuid = s.uuid)      AS docs,
  (SELECT count(*) FROM notifications WHERE profile_uuid = s.uuid)      AS tasks,
  GREATEST(
    COALESCE((SELECT max(created_at) FROM agents                  WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM audit_logs              WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM clipboards              WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM collective_feedback     WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM custom_mcp_servers      WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM docs                    WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM dream_consolidations    WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM embedded_chats          WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM fresh_memory            WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(snapshot_date) FROM individuation_snapshots WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM log_retention_policies  WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM mcp_activity            WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM mcp_oauth_sessions      WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM mcp_servers             WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM mcp_sessions            WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM memory_ring             WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM memory_sessions         WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM notifications           WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM playground_settings     WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM server_installations    WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM shared_collections      WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM shared_mcp_servers      WHERE profile_uuid = s.uuid), 'epoch')
  )                                                                     AS newest_row
FROM secondary s
WHERE GREATEST(
    COALESCE((SELECT max(created_at) FROM agents                  WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM audit_logs              WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM clipboards              WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM collective_feedback     WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM custom_mcp_servers      WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM docs                    WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM dream_consolidations    WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM embedded_chats          WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM fresh_memory            WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(snapshot_date) FROM individuation_snapshots WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM log_retention_policies  WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM mcp_activity            WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM mcp_oauth_sessions      WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM mcp_servers             WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM mcp_sessions            WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM memory_ring             WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM memory_sessions         WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM notifications           WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM playground_settings     WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM server_installations    WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM shared_collections      WHERE profile_uuid = s.uuid), 'epoch'),
    COALESCE((SELECT max(created_at) FROM shared_mcp_servers      WHERE profile_uuid = s.uuid), 'epoch')
  ) > now() - interval '365 days'
ORDER BY newest_row DESC
LIMIT 50;

\echo ''
\echo '=================================================='
\echo '2. Each slug collision: which side is dead?'
\echo '=================================================='
\echo 'slug is the tool-name prefix, so renaming one renames every tool that'
\echo 'server exposes. Rename the side with no recent activity and nobody'
\echo 'notices; rename the other and someone''s saved instructions break.'

WITH colliding AS (
  SELECT pf.project_uuid, s.slug
  FROM mcp_servers s JOIN profiles pf ON pf.uuid = s.profile_uuid
  WHERE s.slug IS NOT NULL
  GROUP BY pf.project_uuid, s.slug HAVING count(*) > 1
)
SELECT
  c.slug,
  s.uuid                                                              AS server_uuid,
  pf.name                                                             AS workspace,
  s.created_at::date                                                  AS server_created,
  (SELECT count(*) FROM mcp_activity a WHERE a.profile_uuid = pf.uuid) AS profile_activity_rows,
  (SELECT max(a.created_at)::date FROM mcp_activity a WHERE a.profile_uuid = pf.uuid) AS last_activity
FROM colliding c
JOIN profiles pf     ON pf.project_uuid = c.project_uuid
JOIN mcp_servers s   ON s.profile_uuid = pf.uuid AND s.slug = c.slug
ORDER BY c.project_uuid, c.slug, last_activity DESC NULLS LAST;

\echo ''
\echo 'Summary: collisions where exactly one side shows any activity are the'
\echo 'ones that resolve themselves — rename the silent side.'

WITH colliding AS (
  SELECT pf.project_uuid, s.slug
  FROM mcp_servers s JOIN profiles pf ON pf.uuid = s.profile_uuid
  WHERE s.slug IS NOT NULL
  GROUP BY pf.project_uuid, s.slug HAVING count(*) > 1
),
sides AS (
  SELECT c.project_uuid, c.slug, pf.uuid AS profile_uuid,
    (SELECT count(*) FROM mcp_activity a WHERE a.profile_uuid = pf.uuid) AS acts
  FROM colliding c
  JOIN profiles pf   ON pf.project_uuid = c.project_uuid
  JOIN mcp_servers s ON s.profile_uuid = pf.uuid AND s.slug = c.slug
)
SELECT
  count(*)                                                       AS collision_groups,
  count(*) FILTER (WHERE live_sides = 0)                         AS both_sides_silent,
  count(*) FILTER (WHERE live_sides = 1)                         AS one_side_live,
  count(*) FILTER (WHERE live_sides > 1)                         AS both_sides_live
FROM (
  SELECT project_uuid, slug, count(*) FILTER (WHERE acts > 0) AS live_sides
  FROM sides GROUP BY project_uuid, slug
) t;
