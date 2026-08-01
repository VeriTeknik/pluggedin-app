'use server';

import { eq } from 'drizzle-orm';
import { isRedirectError } from 'next/dist/client/components/redirect-error';

import { getServerSession } from 'next-auth/next';

import { getProjects } from '@/app/actions/projects';
import { db } from '@/db';
import { oauthAuthorizationCodesTable, oauthClientsTable } from '@/db/schema';
import { authOptions } from '@/lib/auth';
import { buildErrorRedirect } from '@/lib/oauth/provider/authorize';
import { verifyConsentTicket } from '@/lib/oauth/provider/consent-ticket';
import { connectorBaseUrl } from '@/lib/oauth/provider/metadata';
import { redirectUriMatches } from '@/lib/oauth/provider/redirect-uri';
import { TTL, hashCredential, mintCredential } from '@/lib/oauth/provider/tokens';

/**
 * A server action is an HTTP endpoint, so anything it accepts as a parameter is
 * attacker-controlled regardless of what the page that renders the form did.
 *
 * Only two things are accepted here:
 *   - `ticket`: the signed, already-validated authorize request. Its signature
 *     is what makes clientUuid, redirectUri, scopes and codeChallenge
 *     trustworthy; none of them are taken from the caller.
 *   - `grantedProjectUuids`: a genuine user choice, therefore verified against
 *     the projects this user actually owns before anything is issued.
 */
interface ApproveInput {
  ticket: string;
  grantedProjectUuids: string[];
}

export async function approveConsent(input: ApproveInput) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false as const, error: 'Not signed in' };
    }

    const verified = verifyConsentTicket(input.ticket);
    if (!verified.ok) {
      return { success: false as const, error: `Invalid consent request: ${verified.reason}` };
    }
    // The ticket names who it was issued to. Checking only that *somebody* is
    // signed in would let a ticket issued to one user be spent in another's
    // session, minting a code against that user's account and Hubs.
    if (verified.userId !== session.user.id) {
      return { success: false as const, error: 'This consent request belongs to another session' };
    }
    const request = verified.request;

    if (input.grantedProjectUuids.length === 0) {
      return { success: false as const, error: 'Select at least one Hub' };
    }

    // Hub ownership. Without this a caller could name any project_uuid and be
    // granted a token for a Hub belonging to someone else.
    const owned = new Set((await getProjects()).map((project) => project.uuid));
    if (input.grantedProjectUuids.some((uuid) => !owned.has(uuid))) {
      return { success: false as const, error: 'Invalid Hub selection' };
    }

    // Re-check the redirect URI against the client's registration. The ticket is
    // signed, so this cannot have been tampered with — but the client's
    // registered URIs may have changed since the page rendered, and issuing a
    // code to a URI the client no longer claims is exactly the failure this
    // check exists to prevent. Defence in depth, and cheap.
    //
    // Looked up by primary key rather than through resolveClient(): the ticket
    // carries the internal uuid, resolveClient takes the public client_id, and
    // it would also re-fetch the CIMD document — none of which this check needs.
    const clients = await db
      .select()
      .from(oauthClientsTable)
      .where(eq(oauthClientsTable.uuid, request.clientUuid))
      .limit(1);
    const client = clients[0];
    if (!client) {
      return { success: false as const, error: 'Unknown client' };
    }
    const uriAllowed = client.redirect_uris.some((registered) =>
      redirectUriMatches(request.redirectUri, registered)
    );
    if (!uriAllowed) {
      return { success: false as const, error: 'Redirect URI is not registered for this client' };
    }

    const code = mintCredential();
    await db.insert(oauthAuthorizationCodesTable).values({
      code_hash: hashCredential(code),
      client_uuid: request.clientUuid,
      user_id: session.user.id,
      granted_project_uuids: input.grantedProjectUuids,
      scopes: request.scopes,
      redirect_uri: request.redirectUri,
      code_challenge: request.codeChallenge,
      code_challenge_method: 'S256',
      expires_at: new Date(Date.now() + TTL.authorizationCodeMs),
    });

    const url = new URL(request.redirectUri);
    url.searchParams.set('code', code);
    if (request.state !== null) url.searchParams.set('state', request.state);
    // RFC 9207: identify the issuer so the client can detect a mix-up attack.
    url.searchParams.set('iss', connectorBaseUrl());
    return { success: true as const, data: { redirectTo: url.toString() } };
  } catch (error) {
    // Next signals redirects by throwing, so a catch-all swallows them. This
    // one wraps getProjects(), which goes through withAuth() and redirects to
    // /login when the session has gone. Swallowed, the user stays on the
    // consent screen looking at the string "NEXT_REDIRECT" where an error
    // message should be, with no way forward. Same pattern as
    // lib/auth-helpers.ts, which already re-throws these.
    if (isRedirectError(error)) throw error;
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function denyConsent(ticket: string) {
  // Denial writes nothing and issues nothing, and the ticket payload is signed
  // rather than encrypted, so the redirect this returns is one the holder could
  // already build. The check is here because the ticket is bound to a user and
  // every action that reads one should honour that binding — an action that
  // ignores it today is where the next side effect gets added tomorrow.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { success: false as const, error: 'Not signed in' };
  }

  const verified = verifyConsentTicket(ticket);
  if (!verified.ok) {
    return { success: false as const, error: 'Invalid consent request' };
  }
  if (verified.userId !== session.user.id) {
    return { success: false as const, error: 'This consent request belongs to another session' };
  }
  return {
    success: true as const,
    data: {
      redirectTo: buildErrorRedirect(
        verified.request.redirectUri,
        'access_denied',
        'The user declined the request',
        verified.request.state
      ),
    },
  };
}
