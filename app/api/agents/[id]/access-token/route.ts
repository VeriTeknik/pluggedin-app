/**
 * Agent Access Token API
 *
 * Generates short-lived access tokens for agent owners to access their agents.
 * Used for PRIVATE and API_KEY access modes.
 *
 * Token Flow:
 * 1. User clicks "Open Agent" in plugged.in UI
 * 2. This endpoint generates a JWT with agent_uuid, user_id, and expiry
 * 3. User is redirected to agent with ?access_token=xxx
 * 4. Agent validates token by calling /api/agents/[id]/validate-token
 */

import { SignJWT } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { agentsTable, profilesTable, projectsTable } from '@/db/schema';
import { auth } from '@/lib/auth';
import { eq } from 'drizzle-orm';

// Token expires in 5 minutes (sufficient for redirect + validation)
const TOKEN_EXPIRY_SECONDS = 5 * 60;

// Secret key for signing tokens (should be in env vars)
const getSecretKey = () => {
  const secret = process.env.AGENT_ACCESS_TOKEN_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('AGENT_ACCESS_TOKEN_SECRET or NEXTAUTH_SECRET must be set');
  }
  return new TextEncoder().encode(secret);
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params;

    // Verify user is authenticated
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get agent and verify ownership
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.uuid, agentId),
      with: {
        profile: {
          with: {
            project: true,
          },
        },
      },
    });

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    // Verify user owns this agent
    const isOwner = agent.profile?.project?.user_id === session.user.id;
    if (!isOwner) {
      return NextResponse.json(
        { error: 'Access denied. You do not own this agent.' },
        { status: 403 }
      );
    }

    // Generate JWT token
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      agent_uuid: agent.uuid,
      agent_name: agent.name,
      user_id: session.user.id,
      user_email: session.user.email,
      access_level: agent.access_level,
      purpose: 'agent_access',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + TOKEN_EXPIRY_SECONDS)
      .setIssuer('plugged.in')
      .setSubject(session.user.id)
      .setAudience(`agent:${agent.uuid}`)
      .sign(getSecretKey());

    // Build agent URL with token
    const agentUrl = `https://${agent.dns_name}.is.plugged.in?access_token=${token}`;

    return NextResponse.json({
      token,
      expires_in: TOKEN_EXPIRY_SECONDS,
      agent_url: agentUrl,
      agent: {
        uuid: agent.uuid,
        name: agent.name,
        dns_name: agent.dns_name,
        access_level: agent.access_level,
      },
    });
  } catch (error) {
    console.error('[AccessToken] Error generating token:', error);
    return NextResponse.json(
      { error: 'Failed to generate access token' },
      { status: 500 }
    );
  }
}
