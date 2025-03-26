import { getAuthSession } from '@/lib/auth';
import { db } from '@/db';
import { users, accounts, sessions, projectsTable, profilesTable, apiKeysTable, mcpServersTable, customMcpServersTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import { join } from 'path';

export async function DELETE(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Start a transaction to ensure all deletions succeed or none do
    await db.transaction(async (tx) => {
      // Get user's projects to find associated profiles
      const userProjects = await tx
        .select()
        .from(projectsTable)
        .where(eq(projectsTable.user_id, session.user.id));

      // Delete associated data for each project
      for (const project of userProjects) {
        // Get profiles associated with this project
        const projectProfiles = await tx
          .select()
          .from(profilesTable)
          .where(eq(profilesTable.project_uuid, project.uuid));

        // Delete MCP servers for each profile
        for (const profile of projectProfiles) {
          await tx
            .delete(mcpServersTable)
            .where(eq(mcpServersTable.profile_uuid, profile.uuid));

          await tx
            .delete(customMcpServersTable)
            .where(eq(customMcpServersTable.profile_uuid, profile.uuid));
        }

        // Delete API keys
        await tx
          .delete(apiKeysTable)
          .where(eq(apiKeysTable.project_uuid, project.uuid));

        // Delete profiles
        await tx
          .delete(profilesTable)
          .where(eq(profilesTable.project_uuid, project.uuid));
      }

      // Delete projects
      await tx
        .delete(projectsTable)
        .where(eq(projectsTable.user_id, session.user.id));

      // Delete auth-related data
      await tx
        .delete(accounts)
        .where(eq(accounts.userId, session.user.id));

      await tx
        .delete(sessions)
        .where(eq(sessions.userId, session.user.id));

      // Try to delete avatar file if it exists
      if (session.user.image?.startsWith('/avatars/')) {
        try {
          const avatarPath = join(process.cwd(), 'public', session.user.image);
          await unlink(avatarPath);
        } catch (error) {
          // Ignore file deletion errors
          console.error('Failed to delete avatar file:', error);
        }
      }

      // Finally, delete the user
      await tx
        .delete(users)
        .where(eq(users.id, session.user.id));
    });

    return NextResponse.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Account deletion error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
