import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { githubAppInstallationsTable } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user has any GitHub App installations
    const installations = await db
      .select({
        installation_id: githubAppInstallationsTable.installation_id,
        access_token: githubAppInstallationsTable.access_token,
        created_at: githubAppInstallationsTable.created_at,
        updated_at: githubAppInstallationsTable.updated_at,
      })
      .from(githubAppInstallationsTable)
      .where(eq(githubAppInstallationsTable.user_id, session.user.id))
      .orderBy(desc(githubAppInstallationsTable.created_at));

    return NextResponse.json({
      installations,
      hasInstallation: installations.length > 0,
    });
  } catch (error) {
    logger.error('Failed to get GitHub installations', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}