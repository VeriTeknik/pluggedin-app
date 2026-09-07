import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { users } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

/** Infrastructure administration requires a session and a current database role. */
export async function authenticateAdmin(_request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { is_admin: true },
  });
  if (!user?.is_admin) {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { user: session.user };
}
