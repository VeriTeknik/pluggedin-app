import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { oauthClientsTable } from '@/db/schema';
import { DCR_CLIENT_TTL_MS } from '@/lib/oauth/provider/clients';
import { connectorBaseUrl } from '@/lib/oauth/provider/metadata';

// RFC 7591 s3.1: registration requests are application/json. The token endpoint
// is form-urlencoded — do not share a parser between them.
//
// DCR is a fallback. Claude prefers CIMD, which registers nothing; this path
// exists for clients that support only dynamic registration, and every record
// carries a TTL so the table cannot grow without bound.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'Body must be JSON' },
      { status: 400 }
    );
  }

  const record = (body ?? {}) as Record<string, unknown>;
  const redirectUris = record.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return NextResponse.json(
      { error: 'invalid_redirect_uri', error_description: 'redirect_uris is required' },
      { status: 400 }
    );
  }
  if (!redirectUris.every((u) => typeof u === 'string')) {
    return NextResponse.json(
      { error: 'invalid_redirect_uri', error_description: 'redirect_uris must be strings' },
      { status: 400 }
    );
  }

  const clientId = crypto.randomUUID();
  const applicationType =
    typeof record.application_type === 'string' ? record.application_type : 'web';

  await db.insert(oauthClientsTable).values({
    client_id: clientId,
    issuer: connectorBaseUrl(),
    registration_type: 'dcr',
    client_name: typeof record.client_name === 'string' ? record.client_name : null,
    redirect_uris: redirectUris as string[],
    application_type: applicationType,
    token_endpoint_auth_method: 'none',
    expires_at: new Date(Date.now() + DCR_CLIENT_TTL_MS),
  });

  return NextResponse.json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      application_type: applicationType,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
    { status: 201 }
  );
}
