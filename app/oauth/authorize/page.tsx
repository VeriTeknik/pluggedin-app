import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth/next';

import { getProjects } from '@/app/actions/projects';
import { authOptions } from '@/lib/auth';
import { buildErrorRedirect, parseAuthorizeParams } from '@/lib/oauth/authorize';
import { resolveClient } from '@/lib/oauth/clients';
import { issueConsentTicket } from '@/lib/oauth/consent-ticket';
import { connectorBaseUrl } from '@/lib/oauth/metadata';
import { isLoopbackRedirect, redirectUriMatches } from '@/lib/oauth/redirect-uri';

import { ConsentForm } from './consent-form';

export const dynamic = 'force-dynamic';

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) =>
      v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v] as [string, string]]
    )
  );

  const parsed = parseAuthorizeParams(params);
  if (!parsed.ok) {
    const redirectUri = params.get('redirect_uri');
    // Only bounce back to a redirect_uri we can parse; otherwise render the
    // error rather than sending the user to an attacker-supplied URL.
    if (redirectUri) {
      redirect(
        buildErrorRedirect(redirectUri, parsed.error, parsed.description, params.get('state'))
      );
    }
    return <p className="p-6">{parsed.description}</p>;
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/oauth/authorize?${params.toString()}`)}`);
  }

  const client = await resolveClient(parsed.request.clientId, connectorBaseUrl());
  if (!client) {
    redirect(
      buildErrorRedirect(
        parsed.request.redirectUri,
        'invalid_client',
        'Unknown client',
        parsed.request.state
      )
    );
  }

  const uriAllowed = client.redirect_uris.some((registered) =>
    redirectUriMatches(parsed.request.redirectUri, registered)
  );
  if (!uriAllowed) {
    // Never redirect to an unregistered URI, not even to report the error —
    // doing so would turn the check into an open redirect.
    return <p className="p-6">The redirect URI is not registered for this client.</p>;
  }

  const projects = await getProjects();
  const loopbackOnly = client.redirect_uris.every(isLoopbackRedirect);

  // The validated request is signed into a ticket rather than handed to the
  // browser as editable fields. A server action is an HTTP endpoint, so if the
  // action accepted redirectUri / codeChallenge / clientUuid as parameters,
  // every check above would be decorative.
  const ticket = issueConsentTicket({
    clientUuid: client.uuid,
    redirectUri: parsed.request.redirectUri,
    scopes: parsed.request.scopes,
    codeChallenge: parsed.request.codeChallenge,
    state: parsed.request.state,
  });

  return (
    <ConsentForm
      ticket={ticket}
      clientName={client.client_id}
      redirectHost={new URL(parsed.request.redirectUri).host}
      loopbackOnly={loopbackOnly}
      scopes={parsed.request.scopes}
      projects={projects.map((p) => ({ uuid: p.uuid, name: p.name }))}
    />
  );
}
