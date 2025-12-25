/**
 * Admin API Keys Management
 *
 * GET  /api/admin/api-keys - Get API key status (configured/missing)
 * POST /api/admin/api-keys - Update API keys (requires restart)
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { users } from '@/db/schema';
import { getAdminEmails } from '@/lib/admin-notifications';
import { getAuthSession } from '@/lib/auth';

export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'xai' | 'deepseek';

export interface APIKeyStatus {
  provider: ModelProvider;
  configured: boolean;
  envVar: string;
  lastFourChars?: string;
}

const API_KEY_ENV_VARS: Record<ModelProvider, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  xai: 'XAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
};

/**
 * Check if the current user is an admin.
 * Returns user info if admin, null otherwise.
 */
async function checkAdminAuth(): Promise<{ userId: string; email: string } | null> {
  const session = await getAuthSession();

  if (!session?.user?.email || !session?.user?.id) {
    return null;
  }

  // Check database for admin status first
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  let isAdmin = user?.is_admin || false;

  // Fallback to environment variable check
  if (!isAdmin) {
    const adminEmails = getAdminEmails();
    isAdmin = adminEmails.includes(session.user.email);
  }

  if (!isAdmin) {
    return null;
  }

  return { userId: session.user.id, email: session.user.email };
}

/**
 * GET /api/admin/api-keys
 * Returns status of all model provider API keys
 */
export async function GET(request: Request) {
  const admin = await checkAdminAuth();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const status: APIKeyStatus[] = Object.entries(API_KEY_ENV_VARS).map(
    ([provider, envVar]) => {
      const apiKey = process.env[envVar];
      const configured = !!apiKey && apiKey.length > 0;

      return {
        provider: provider as ModelProvider,
        configured,
        envVar,
        lastFourChars: configured && apiKey ? apiKey.slice(-4) : undefined,
      };
    }
  );

  return NextResponse.json({ apiKeys: status });
}
