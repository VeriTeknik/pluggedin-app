import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
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

    // Get the GitHub App ID from environment
    const appId = process.env.GITHUB_APP_ID;
    if (!appId) {
      logger.error('GitHub App ID not configured');
      return NextResponse.json(
        { error: 'GitHub App not configured' },
        { status: 500 }
      );
    }

    // Generate state parameter for security
    const state = Buffer.from(
      JSON.stringify({
        userId: session.user.id,
        timestamp: Date.now(),
      })
    ).toString('base64');

    // Store state in session (you might want to use a database or cache)
    // For now, we'll pass it in the URL

    // Construct GitHub App installation URL
    const installUrl = new URL(`https://github.com/apps/${process.env.GITHUB_APP_NAME || 'plugged-in-registry'}/installations/new`);
    installUrl.searchParams.set('state', state);

    return NextResponse.json({
      installUrl: installUrl.toString(),
    });
  } catch (error) {
    logger.error('Failed to initialize GitHub auth', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}