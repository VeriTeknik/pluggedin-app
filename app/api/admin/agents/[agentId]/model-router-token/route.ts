/**
 * Admin Agent Model Router Token API
 *
 * Manage model router JWT tokens for agents.
 *
 * @route POST /api/admin/agents/[agentId]/model-router-token - Regenerate token
 * @route DELETE /api/admin/agents/[agentId]/model-router-token - Revoke token
 */

import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { agentsTable, users } from '@/db/schema';
import { getAdminEmails } from '@/lib/admin-notifications';
import { getAuthSession } from '@/lib/auth';
import { generateModelRouterToken } from '@/lib/model-router/token';

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
 * POST /api/admin/agents/[agentId]/model-router-token
 *
 * Regenerate the model router JWT token for an agent.
 * This will:
 * 1. Generate a new JWT token
 * 2. Update the agent record in the database
 * 3. Return the new token (agent will pick it up on next deployment/restart)
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ agentId: string }> }
) {
  try {
    // Check admin authentication
    const admin = await checkAdminAuth();
    if (!admin) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }

    const params = await props.params;
    const { agentId } = params;

    // Find the agent
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.uuid, agentId),
    });

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    // Generate new JWT token
    const newToken = await generateModelRouterToken(agent.uuid, agent.name);

    // Update agent with new token
    await db
      .update(agentsTable)
      .set({
        model_router_token: newToken,
        model_router_token_issued_at: new Date(),
        model_router_token_revoked: false,
      })
      .where(eq(agentsTable.uuid, agentId));

    return NextResponse.json({
      success: true,
      message: 'Model router token regenerated successfully',
      data: {
        agent_id: agent.uuid,
        agent_name: agent.name,
        token_issued_at: new Date().toISOString(),
        note: 'Agent will use new token on next restart or when environment is refreshed',
      },
    });
  } catch (error) {
    console.error('Failed to regenerate model router token:', error);
    return NextResponse.json(
      {
        error: 'Failed to regenerate token',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/agents/[agentId]/model-router-token
 *
 * Revoke the model router JWT token for an agent.
 * This will:
 * 1. Mark the token as revoked in the database
 * 2. The agent will fail authentication with the model router until a new token is issued
 */
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ agentId: string }> }
) {
  try {
    // Check admin authentication
    const admin = await checkAdminAuth();
    if (!admin) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }

    const params = await props.params;
    const { agentId } = params;

    // Find the agent
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.uuid, agentId),
    });

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    // Mark token as revoked
    await db
      .update(agentsTable)
      .set({
        model_router_token_revoked: true,
      })
      .where(eq(agentsTable.uuid, agentId));

    return NextResponse.json({
      success: true,
      message: 'Model router token revoked successfully',
      data: {
        agent_id: agent.uuid,
        agent_name: agent.name,
        note: 'Agent can no longer authenticate with model router. Regenerate token to restore access.',
      },
    });
  } catch (error) {
    console.error('Failed to revoke model router token:', error);
    return NextResponse.json(
      {
        error: 'Failed to revoke token',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
