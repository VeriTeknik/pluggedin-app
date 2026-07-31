'use server';

import { getServerSession } from 'next-auth/next';

import { db } from '@/db';
import { oauthAuthorizationCodesTable } from '@/db/schema';
import { authOptions } from '@/lib/auth';
import { buildErrorRedirect } from '@/lib/oauth/authorize';
import { connectorBaseUrl } from '@/lib/oauth/metadata';
import type { Scope } from '@/lib/oauth/scopes';
import { TTL, hashCredential, mintCredential } from '@/lib/oauth/tokens';

interface ApproveInput {
  clientUuid: string;
  redirectUri: string;
  scopes: Scope[];
  grantedProjectUuids: string[];
  state: string | null;
  codeChallenge: string;
}

export async function approveConsent(input: ApproveInput) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false as const, error: 'Not signed in' };
    }
    if (input.grantedProjectUuids.length === 0) {
      return { success: false as const, error: 'Select at least one Hub' };
    }

    const code = mintCredential();
    await db.insert(oauthAuthorizationCodesTable).values({
      code_hash: hashCredential(code),
      client_uuid: input.clientUuid,
      user_id: session.user.id,
      granted_project_uuids: input.grantedProjectUuids,
      scopes: input.scopes,
      redirect_uri: input.redirectUri,
      code_challenge: input.codeChallenge,
      code_challenge_method: 'S256',
      expires_at: new Date(Date.now() + TTL.authorizationCodeMs),
    });

    const url = new URL(input.redirectUri);
    url.searchParams.set('code', code);
    if (input.state !== null) url.searchParams.set('state', input.state);
    // RFC 9207: identify the issuer so the client can detect a mix-up attack.
    url.searchParams.set('iss', connectorBaseUrl());
    return { success: true as const, data: { redirectTo: url.toString() } };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function denyConsent(redirectUri: string, state: string | null) {
  return {
    success: true as const,
    data: {
      redirectTo: buildErrorRedirect(
        redirectUri,
        'access_denied',
        'The user declined the request',
        state
      ),
    },
  };
}
