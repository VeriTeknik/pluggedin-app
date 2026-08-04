/**
 * Bearer authentication for the MCP endpoint.
 *
 * The 401 is the entire discovery handshake. Anthropic's documentation is
 * explicit: "Claude does not honor a WWW-Authenticate header on a 200
 * response." Returning a tool-level error instead of a 401 is the most common
 * way this integration silently fails — Claude never learns where the
 * authorization server is and the connection simply cannot be established.
 */

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { oauthAccessTokensTable } from '@/db/schema';

import type { Scope } from './scopes';
import { hashCredential } from './tokens';

export interface ConnectorIdentity {
  userId: string;
  grantedProjectUuids: string[];
  defaultProjectUuid: string | null;
  scopes: Scope[];
  tokenUuid: string;
}

export function buildUnauthorizedResponse(
  resourceMetadataUrl: string,
  scopes?: Scope[]
): Response {
  const parts = [`Bearer resource_metadata="${resourceMetadataUrl}"`];
  if (scopes && scopes.length > 0) parts.push(`scope="${scopes.join(' ')}"`);

  return new Response(
    JSON.stringify({ error: 'unauthorized', error_description: 'Authentication required' }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': parts.join(', '),
        'Cache-Control': 'no-store',
      },
    }
  );
}

export async function authenticateConnectorRequest(
  req: Request
): Promise<{ ok: true; identity: ConnectorIdentity } | { ok: false; response: Response }> {
  const base = (process.env.NEXTAUTH_URL ?? '').replace(/\/+$/, '');
  const metadataUrl = `${base}/.well-known/oauth-protected-resource`;

  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    return { ok: false, response: buildUnauthorizedResponse(metadataUrl) };
  }

  const token = header.slice(7).trim();
  const rows = await db
    .select()
    .from(oauthAccessTokensTable)
    .where(eq(oauthAccessTokensTable.token_hash, hashCredential(token)))
    .limit(1);

  const record = rows[0];
  if (!record || record.revoked_at || record.expires_at.getTime() <= Date.now()) {
    return { ok: false, response: buildUnauthorizedResponse(metadataUrl) };
  }

  // Fire-and-forget: last_used_at is telemetry, and awaiting it would put a
  // write on the critical path of every tool call.
  //
  // The catch is not decoration. An unhandled rejection terminates the process
  // by default since Node 15, so without it a transient database error on a
  // telemetry write could take down the server in the middle of serving a
  // request that had already succeeded.
  void db
    .update(oauthAccessTokensTable)
    .set({ last_used_at: new Date() })
    .where(eq(oauthAccessTokensTable.uuid, record.uuid))
    .catch((error) => {
      console.warn('[connector] last_used_at update failed', {
        error: error instanceof Error ? error.message : 'unknown',
      });
    });

  return {
    ok: true,
    identity: {
      userId: record.user_id,
      grantedProjectUuids: record.granted_project_uuids,
      defaultProjectUuid: record.default_project_uuid,
      scopes: record.scopes as Scope[],
      tokenUuid: record.uuid,
    },
  };
}
