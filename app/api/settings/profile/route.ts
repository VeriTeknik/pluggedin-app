import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { profilesTable, projectsTable, users } from '@/db/schema';
import { locales } from '@/i18n/config';
import { getAuthSession } from '@/lib/auth';

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  language: z.enum(locales),
});

export async function PATCH(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await req.json();
    const { name, language } = profileSchema.parse(body);

    // Update user name if provided
    if (name) {
      await db
        .update(users)
        .set({ name, updated_at: new Date() })
        .where(eq(users.id, session.user.id));
    }

    // Get current project
    const project = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.user_id, session.user.id))
      .limit(1);

    if (!project[0]?.active_profile_uuid) {
      return new NextResponse('No active profile found', { status: 404 });
    }

    // Update profile language
    await db
      .update(profilesTable)
      .set({ language })
      .where(eq(profilesTable.uuid, project[0].active_profile_uuid));

    return NextResponse.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Profile update error:', error);
    if (error instanceof z.ZodError) {
      return new NextResponse(JSON.stringify(error.errors), { status: 400 });
    }
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
