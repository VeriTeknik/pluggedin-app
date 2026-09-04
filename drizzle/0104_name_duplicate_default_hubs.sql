-- Give the duplicate "Default Hub" a name of its own.
--
-- A race in default-project creation gave 27 users two Hubs both called
-- "Default Hub", created seconds apart, each with its own Workspace and its own
-- servers. The race itself was closed in #225 (the creation path now takes a
-- row lock and returns the existing project); this is the data left behind.
--
-- Nothing is merged and nothing is deleted. The later Hub stays exactly as it
-- is — its Workspace, its servers, its slugs — and only its name changes, so
-- the user sees two distinguishable Hubs instead of two identical ones. Merging
-- was considered and rejected: mcp_servers.slug is the tool-name prefix
-- ({slug}__{tool}), and the duplicates hold the same sample servers, so a merge
-- would have to rename slugs and would silently invalidate any saved
-- instruction naming those tools.
--
-- Ordering is by created_at, which differs within every pair in production, so
-- "the later one" is well defined. uuid breaks a tie if a same-instant pair
-- ever exists. In two of the 27 pairs the later Hub holds MORE servers than the
-- earlier one; it still keeps all of them, it is simply the one that gets the
-- suffix, because the earlier Hub is the one the user has been using longest.
--
-- Idempotent: a second run finds nothing, because renamed rows no longer match
-- name = 'Default Hub'. Suffixes start at 2 and skip any name the user already
-- has, so a hand-made "Default Hub 2" is not collided with.
WITH ranked AS (
  SELECT
    uuid,
    user_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, uuid) AS rn
  FROM projects
  WHERE name = 'Default Hub'
),
duplicates AS (
  SELECT uuid, user_id, rn
  FROM ranked
  WHERE rn > 1
),
named AS (
  SELECT
    d.uuid,
    (
      -- The first free "Default Hub N" for this user, N counting from 2.
      -- Unbounded rather than generate_series(2, 100): a bound leaves
      -- new_name NULL past the end, and a NULL name silently means "this row
      -- stays duplicated, and every later run will also fail to name it".
      -- One free number always exists below (count of this user's projects + 2).
      SELECT 'Default Hub ' || n
      FROM generate_series(
             2,
             (SELECT count(*) + 2 FROM projects p2 WHERE p2.user_id = d.user_id)::int
           ) AS n
      WHERE NOT EXISTS (
        SELECT 1 FROM projects p
        WHERE p.user_id = d.user_id
          AND p.name = 'Default Hub ' || n
      )
      -- ORDER BY is not decoration. Without it Postgres may return the free
      -- numbers in any order it likes, and it does: an integration test on a
      -- two-row table produced "Default Hub 95". The production dry run had
      -- happened to give 2, which is exactly how this would have reached
      -- users.
      ORDER BY n
      -- Deterministic when several duplicates share a user: the second one
      -- takes the second free number, and so on.
      OFFSET d.rn - 2
      LIMIT 1
    ) AS new_name
  FROM duplicates d
)
UPDATE projects
SET name = named.new_name
FROM named
WHERE projects.uuid = named.uuid
  AND named.new_name IS NOT NULL;
