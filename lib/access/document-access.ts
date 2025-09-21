import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { docsTable, profilesTable, projectsTable } from '@/db/schema';

/**
 * Ensure user has access to a document
 * @param documentId UUID of the document
 * @param userId User ID from authentication
 * @throws Error with "ACCESS_DENIED" message if no access
 */
export async function ensureDocumentAccess(
  documentId: string,
  userId: string
): Promise<void> {
  const result = await db
    .select({ uuid: docsTable.uuid })
    .from(docsTable)
    .innerJoin(profilesTable, eq(docsTable.profile_uuid, profilesTable.uuid))
    .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
    .where(
      and(
        eq(docsTable.uuid, documentId),
        eq(projectsTable.user_id, userId)
      )
    )
    .limit(1);

  if (result.length === 0) {
    throw new Error('ACCESS_DENIED');
  }
}