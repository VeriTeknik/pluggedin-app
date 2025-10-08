import { and, or, eq, isNull, gte, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import { docsTable, projectsTable } from '@/db/schema';

/**
 * Fetches the user_id associated with a project
 * Used for legacy document support (NULL project_uuid + user_id match)
 */
export async function getProjectUserId(projectUuid?: string): Promise<string | null> {
  if (!projectUuid) return null;

  const [project] = await db
    .select({ user_id: projectsTable.user_id })
    .from(projectsTable)
    .where(eq(projectsTable.uuid, projectUuid))
    .limit(1);

  return project?.user_id ?? null;
}

/**
 * Builds document filter conditions with legacy document support
 *
 * @param opts - Filtering options
 * @param opts.projectUuid - Project UUID to filter by (preferred)
 * @param opts.profileUuid - Profile UUID (fallback for backwards compatibility)
 * @param opts.projectUserId - User ID from project (for legacy document support)
 * @param opts.cutoff - Optional date cutoff for created_at filtering
 * @returns Array of SQL conditions to be combined with AND
 */
export function buildDocConditions(opts: {
  projectUuid?: string;
  profileUuid: string;
  projectUserId: string | null;
  cutoff?: Date;
}): Array<SQL | undefined> {
  const { projectUuid, profileUuid, projectUserId, cutoff } = opts;
  const conditions: Array<SQL | undefined> = [];

  // Primary filtering: project-based with legacy support
  if (projectUuid && projectUserId) {
    // Include documents with the project_uuid OR legacy documents (NULL project_uuid) for this user
    conditions.push(
      or(
        eq(docsTable.project_uuid, projectUuid),
        and(
          isNull(docsTable.project_uuid),
          eq(docsTable.user_id, projectUserId)
        )
      )
    );
  } else if (projectUuid) {
    // Fallback if project not found (shouldn't happen with valid projectUuid)
    conditions.push(eq(docsTable.project_uuid, projectUuid));
  } else {
    // Fall back to profile_uuid for backwards compatibility
    conditions.push(eq(docsTable.profile_uuid, profileUuid));
  }

  // Date filtering
  if (cutoff) {
    conditions.push(gte(docsTable.created_at, cutoff));
  }

  return conditions;
}

/**
 * Complete helper that fetches projectUserId and builds doc conditions in one call
 *
 * @param opts - Filtering options
 * @returns Object containing projectUserId and conditions array
 */
export async function buildDocFilterWithProjectLookup(opts: {
  projectUuid?: string;
  profileUuid: string;
  cutoff?: Date;
}): Promise<{
  projectUserId: string | null;
  conditions: Array<SQL | undefined>;
}> {
  const projectUserId = await getProjectUserId(opts.projectUuid);
  const conditions = buildDocConditions({
    projectUuid: opts.projectUuid,
    profileUuid: opts.profileUuid,
    projectUserId,
    cutoff: opts.cutoff,
  });

  return { projectUserId, conditions };
}
