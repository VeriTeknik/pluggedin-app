import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { profilesTable } from '@/db/schema';

/**
 * Does this user own this profile?
 *
 * A profile belongs to a project, and a project belongs to a user; ownership is
 * that two-hop join. This lives in lib/ rather than beside one caller because
 * the check being present in the server action and absent from the REST route
 * that does the same thing is exactly how GHSA-fv94-f4f5-vr99 happened.
 *
 * Only the one column the answer depends on is selected. The earlier copy in
 * app/actions/social.ts asked for `project: true`, which loads every column of
 * the project to compare one of them.
 *
 * Returns false on a database error: a check that could not complete has not
 * established ownership, and every caller treats false as "deny".
 */
export async function userOwnsProfile(userId: string, profileUuid: string): Promise<boolean> {
  if (!userId || !profileUuid) {
    return false;
  }

  try {
    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.uuid, profileUuid),
      columns: { uuid: true },
      with: { project: { columns: { user_id: true } } },
    });

    return profile?.project?.user_id === userId;
  } catch (error) {
    console.error('Error checking profile ownership:', error);
    return false;
  }
}
