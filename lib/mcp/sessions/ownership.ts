import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { profilesTable, projectsTable } from '@/db/schema';

import { getSessionManager } from './SessionManager';

/** Session IDs identify a connection; they do not authorize access to it. */
export async function ownsMcpSession(sessionId: string, userId: string): Promise<boolean> {
  const session = await getSessionManager().getSession(sessionId);
  if (!session) return false;
  const [owned] = await db.select({ uuid: profilesTable.uuid })
    .from(profilesTable)
    .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
    .where(and(eq(profilesTable.uuid, session.profile_uuid), eq(projectsTable.user_id, userId)))
    .limit(1);
  return Boolean(owned);
}
