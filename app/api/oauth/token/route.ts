import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { oauthClientsTable } from '@/db/schema';
import { redeemAuthorizationCode, rotateRefreshToken } from '@/lib/oauth/grants';
import { connectorBaseUrl } from '@/lib/oauth/metadata';

// RFC 6749 s4.1.3: this endpoint takes application/x-www-form-urlencoded.
// Next.js route handlers default to JSON parsing, which returns 415 here and
// looks like an outage rather than a content-type bug. req.formData() is the
// correct reader; DCR at /api/oauth/register uses req.json() instead.
//
// Anthropic allows 10 s for a token request and 30 s for a refresh. Nothing
// slow may sit in front of the response.

function oauthError(error: string, description: string, status = 400) {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } }
  );
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return oauthError('invalid_request', 'Body must be application/x-www-form-urlencoded');
  }

  const grantType = String(form.get('grant_type') ?? '');
  const clientId = String(form.get('client_id') ?? '');
  if (!clientId) return oauthError('invalid_client', 'client_id is required');

  const clients = await db
    .select()
    .from(oauthClientsTable)
    .where(
      and(
        eq(oauthClientsTable.client_id, clientId),
        eq(oauthClientsTable.issuer, connectorBaseUrl())
      )
    )
    .limit(1);
  const client = clients[0];
  if (!client) return oauthError('invalid_client', 'Unknown client', 401);

  if (grantType === 'authorization_code') {
    const result = await redeemAuthorizationCode({
      code: String(form.get('code') ?? ''),
      clientUuid: client.uuid,
      redirectUri: String(form.get('redirect_uri') ?? ''),
      codeVerifier: String(form.get('code_verifier') ?? ''),
    });
    if (!result.ok) return oauthError(result.error, result.description);
    return NextResponse.json(result.tokens, {
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    });
  }

  if (grantType === 'refresh_token') {
    const result = await rotateRefreshToken({
      refreshToken: String(form.get('refresh_token') ?? ''),
      clientUuid: client.uuid,
    });
    // Must be invalid_grant, not a custom code — Claude's refresh handling keys
    // off RFC 6749 codes and breaks on anything else.
    if (!result.ok) return oauthError(result.error, result.description);
    return NextResponse.json(result.tokens, {
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    });
  }

  return oauthError('unsupported_grant_type', `Unsupported grant_type "${grantType}"`);
}
