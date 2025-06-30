import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { githubAppInstallationsTable } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const installationId = searchParams.get('installation_id');
    const setupAction = searchParams.get('setup_action');
    const state = searchParams.get('state');

    // Check if user is authenticated
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Validate state if provided
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        if (stateData.userId !== session.user.id) {
          logger.error('State validation failed', { stateData, sessionUserId: session.user.id });
          return NextResponse.redirect(new URL('/search/import?error=invalid_state', request.url));
        }
      } catch (error) {
        logger.error('Failed to parse state', { error });
      }
    }

    if (!installationId) {
      return NextResponse.redirect(new URL('/search/import?error=no_installation', request.url));
    }

    // Exchange code for access token if provided
    if (code) {
      try {
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code,
          }),
        });

        const tokenData = await tokenResponse.json();
        if (tokenData.error) {
          logger.error('Failed to exchange code for token', { error: tokenData.error });
          return NextResponse.redirect(new URL('/search/import?error=token_exchange_failed', request.url));
        }

        // Store the installation and token data
        await db
          .insert(githubAppInstallationsTable)
          .values({
            user_id: session.user.id,
            installation_id: installationId,
            access_token: tokenData.access_token,
            token_type: tokenData.token_type || 'bearer',
          })
          .onConflictDoUpdate({
            target: [githubAppInstallationsTable.user_id, githubAppInstallationsTable.installation_id],
            set: {
              access_token: tokenData.access_token,
              token_type: tokenData.token_type || 'bearer',
              updated_at: new Date(),
            },
          });
      } catch (error) {
        logger.error('Failed to process GitHub callback', { error });
      }
    } else {
      // Just store the installation ID without a user token
      await db
        .insert(githubAppInstallationsTable)
        .values({
          user_id: session.user.id,
          installation_id: installationId,
        })
        .onConflictDoNothing({
          target: [githubAppInstallationsTable.user_id, githubAppInstallationsTable.installation_id],
        });
    }

    // Redirect back to import page with success
    return NextResponse.redirect(new URL('/search/import?github_connected=true', request.url));
  } catch (error) {
    logger.error('GitHub callback error', { error });
    return NextResponse.redirect(new URL('/search/import?error=callback_failed', request.url));
  }
}