-- Survey: what would collapsing Workspaces (profiles) into Hubs (projects) cost?
--
-- READ ONLY. Every statement is a SELECT; nothing is written, created or locked
-- beyond a read. Safe to paste into a production psql session.
--
--   psql "$DATABASE_URL" -f workspace-collapse-survey.sql
--
-- The question is not "can we migrate" — 25 tables carry profile_uuid and the
-- mechanical part is routine. It is "what happens to the users who actually
-- used more than one Workspace", because five unique constraints include
-- profile_uuid and merging is where those collide.
--
-- Read section 2 first. If it is all zeros, B is a mechanical migration.

\echo '=============================================='
\echo '1. How much multi-Workspace usage exists at all'
\echo '=============================================='

SELECT
  (SELECT count(*) FROM users)                                   AS users_total,
  (SELECT count(*) FROM users WHERE show_workspace_ui)           AS users_with_workspace_ui,
  (SELECT count(*) FROM users
     WHERE show_workspace_ui AND last_login_at > now() - interval '90 days')
                                                                 AS users_active_90d,
  (SELECT count(*) FROM projects)                                AS projects_total,
  (SELECT count(*) FROM (
     SELECT project_uuid FROM profiles GROUP BY project_uuid HAVING count(*) > 1
   ) t)                                                          AS projects_multi_profile;

-- Of the multi-Workspace projects, whose are they and are those people still here?
SELECT
  u.id                                        AS user_id,
  u.last_login_at,
  count(DISTINCT pr.uuid)                     AS projects,
  count(pf.uuid)                              AS profiles
FROM users u
JOIN projects pr ON pr.user_id = u.id
JOIN profiles pf ON pf.project_uuid = pr.uuid
GROUP BY u.id, u.last_login_at
HAVING count(pf.uuid) > count(DISTINCT pr.uuid)   -- more profiles than projects
ORDER BY u.last_login_at DESC NULLS LAST
LIMIT 50;

\echo ''
\echo '=============================================='
\echo '2. Collisions a merge would actually produce'
\echo '=============================================='
\echo 'Each number is how many rows could not keep their key if the profiles'
\echo 'inside one project became one. Zero everywhere means B is mechanical.'

-- mcp_servers (profile_uuid, slug)
SELECT 'mcp_servers.slug' AS constraint_, count(*) AS colliding_groups, COALESCE(sum(n), 0) - count(*) AS rows_to_rename
FROM (
  SELECT pf.project_uuid, s.slug, count(*) AS n
  FROM mcp_servers s JOIN profiles pf ON pf.uuid = s.profile_uuid
  WHERE s.slug IS NOT NULL
  GROUP BY pf.project_uuid, s.slug HAVING count(*) > 1
) t;

-- clipboards (profile_uuid, name)
SELECT 'clipboards.name' AS constraint_, count(*) AS colliding_groups, COALESCE(sum(n), 0) - count(*) AS rows_to_rename
FROM (
  SELECT pf.project_uuid, c.name, count(*) AS n
  FROM clipboards c JOIN profiles pf ON pf.uuid = c.profile_uuid
  WHERE c.name IS NOT NULL
  GROUP BY pf.project_uuid, c.name HAVING count(*) > 1
) t;

-- clipboards (profile_uuid, idx) — positional push/pop entries. Renumbering
-- these changes what pop() returns, so a collision here is a behaviour
-- decision, not a rename.
SELECT 'clipboards.idx' AS constraint_, count(*) AS colliding_groups, COALESCE(sum(n), 0) - count(*) AS rows_to_renumber
FROM (
  SELECT pf.project_uuid, c.idx, count(*) AS n
  FROM clipboards c JOIN profiles pf ON pf.uuid = c.profile_uuid
  WHERE c.idx IS NOT NULL
  GROUP BY pf.project_uuid, c.idx HAVING count(*) > 1
) t;

-- collective_feedback (pattern_uuid, profile_uuid)
SELECT 'collective_feedback' AS constraint_, count(*) AS colliding_groups, COALESCE(sum(n), 0) - count(*) AS rows_to_drop_or_merge
FROM (
  SELECT pf.project_uuid, f.pattern_uuid, count(*) AS n
  FROM collective_feedback f JOIN profiles pf ON pf.uuid = f.profile_uuid
  GROUP BY pf.project_uuid, f.pattern_uuid HAVING count(*) > 1
) t;

-- individuation_snapshots (profile_uuid, snapshot_date)
SELECT 'individuation_snapshots' AS constraint_, count(*) AS colliding_groups, COALESCE(sum(n), 0) - count(*) AS rows_to_merge
FROM (
  SELECT pf.project_uuid, s.snapshot_date, count(*) AS n
  FROM individuation_snapshots s JOIN profiles pf ON pf.uuid = s.profile_uuid
  GROUP BY pf.project_uuid, s.snapshot_date HAVING count(*) > 1
) t;

\echo ''
\echo '=============================================='
\echo '3. Which tables carry data under a second Workspace'
\echo '=============================================='
\echo 'Rows belonging to a profile that is NOT the oldest one in its project.'
\echo 'These are the rows a merge has to move. A table reading 0 needs no'
\echo 'thought at all.'

WITH primary_profile AS (
  SELECT DISTINCT ON (project_uuid) project_uuid, uuid
  FROM profiles ORDER BY project_uuid, created_at
),
secondary AS (
  SELECT pf.uuid FROM profiles pf
  LEFT JOIN primary_profile pp ON pp.uuid = pf.uuid
  WHERE pp.uuid IS NULL
)
SELECT 'mcp_servers' AS tbl, count(*) FROM mcp_servers            WHERE profile_uuid IN (SELECT uuid FROM secondary)
UNION ALL SELECT 'docs',            count(*) FROM docs            WHERE profile_uuid IN (SELECT uuid FROM secondary)
UNION ALL SELECT 'clipboards',      count(*) FROM clipboards      WHERE profile_uuid IN (SELECT uuid FROM secondary)
UNION ALL SELECT 'notifications',   count(*) FROM notifications   WHERE profile_uuid IN (SELECT uuid FROM secondary)
UNION ALL SELECT 'mcp_activity',    count(*) FROM mcp_activity    WHERE profile_uuid IN (SELECT uuid FROM secondary)
UNION ALL SELECT 'agents',          count(*) FROM agents          WHERE profile_uuid IN (SELECT uuid FROM secondary)
UNION ALL SELECT 'memory_ring',     count(*) FROM memory_ring     WHERE profile_uuid IN (SELECT uuid FROM secondary)
UNION ALL SELECT 'fresh_memory',    count(*) FROM fresh_memory    WHERE profile_uuid IN (SELECT uuid FROM secondary)
UNION ALL SELECT 'memory_sessions', count(*) FROM memory_sessions WHERE profile_uuid IN (SELECT uuid FROM secondary)
UNION ALL SELECT 'shared_mcp_servers', count(*) FROM shared_mcp_servers WHERE profile_uuid IN (SELECT uuid FROM secondary)
ORDER BY 2 DESC;

\echo ''
\echo '=============================================='
\echo '4. Are the second Workspaces even in use?'
\echo '=============================================='
\echo 'A secondary Workspace with no rows anywhere is a leftover, not a user'
\echo 'decision — those can be dropped rather than merged.'
\echo ''
\echo 'NOTE: earlier versions of this hand-picked a handful of tables and so'
\echo 'reported Workspaces as empty that were not — mcp_activity, the largest'
\echo 'of them, was among the omissions. If you ran one of those, the empty'
\echo 'side of the split is overstated. This counts all 22 tables carrying'
\echo 'profile_uuid, taken from information_schema rather than chosen by hand.'

WITH primary_profile AS (
  SELECT DISTINCT ON (project_uuid) project_uuid, uuid
  FROM profiles ORDER BY project_uuid, created_at
),
secondary AS (
  SELECT pf.uuid, pf.name, pf.project_uuid, pf.created_at
  FROM profiles pf
  LEFT JOIN primary_profile pp ON pp.uuid = pf.uuid
  WHERE pp.uuid IS NULL
)
SELECT
  count(*)                                                        AS secondary_workspaces,
  count(*) FILTER (WHERE used = 0)                                AS completely_empty,
  count(*) FILTER (WHERE used > 0)                                AS holding_data
FROM (
  SELECT s.uuid,
    (SELECT count(*) FROM agents                  WHERE profile_uuid = s.uuid)
  + (SELECT count(*) FROM audit_logs              WHERE profile_uuid = s.uuid)
  + (SELECT count(*) FROM clipboards              WHERE profile_uuid = s.uuid)
  + (SELECT count(*) FROM collective_feedback     WHERE profile_uuid = s.uuid)
  + (SELECT count(*) FROM custom_mcp_servers      WHERE profile_uuid = s.uuid)
  + (SELECT count(*) FROM docs                    WHERE profile_uuid = s.uuid)
  + (SELECT count(*) FROM dream_consolidations    WHERE profile_uuid = s.uuid)
  + (SELECT count(*) FROM embedded_chats          WHERE profile_uuid = s.uuid)
  + (SELECT count(*) FROM fresh_memory            WHERE profile_uuid = s.uuid)
  + (SELECT count(*) FROM individuation_snapshots WHERE profile_uuid = s.uuid)
  + (SELECT count(*) FROM log_retention_policies  WHERE profile_uuid = s.uuid)
  + (SELECT count(*) FROM mcp_activity            WHERE profile_uuid = s.uuid)
  + (SELECT count(*) FROM mcp_oauth_sessions      WHERE profile_uuid = s.uuid)
  + (SELECT count(*) FROM mcp_servers             WHERE profile_uuid = s.uuid)
  + (SELECT count(*) FROM mcp_sessions            WHERE profile_uuid = s.uuid)
  + (SELECT count(*) FROM memory_ring             WHERE profile_uuid = s.uuid)
  + (SELECT count(*) FROM memory_sessions         WHERE profile_uuid = s.uuid)
  + (SELECT count(*) FROM notifications           WHERE profile_uuid = s.uuid)
  + (SELECT count(*) FROM playground_settings     WHERE profile_uuid = s.uuid)
  + (SELECT count(*) FROM server_installations    WHERE profile_uuid = s.uuid)
  + (SELECT count(*) FROM shared_collections      WHERE profile_uuid = s.uuid)
  + (SELECT count(*) FROM shared_mcp_servers      WHERE profile_uuid = s.uuid) AS used
  FROM secondary s
) t;
