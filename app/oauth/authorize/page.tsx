import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth/next';

import { getProjects } from '@/app/actions/projects';
import { authOptions } from '@/lib/auth';
import { buildErrorRedirect, parseAuthorizeParams } from '@/lib/oauth/provider/authorize';
import { describeClient } from '@/lib/oauth/provider/client-display';
import { resolveClient } from '@/lib/oauth/provider/clients';
import { issueConsentTicket } from '@/lib/oauth/provider/consent-ticket';
import { connectorBaseUrl } from '@/lib/oauth/provider/metadata';
import { isLoopbackRedirect, redirectUriMatches } from '@/lib/oauth/provider/redirect-uri';

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

  // Order matters here, and RFC 6749 s4.1.2.1 dictates it: when the client
  // identifier or the redirect URI is missing, invalid or unregistered, the
  // server "MUST NOT automatically redirect the user-agent to the invalid
  // redirect URI" — it has to tell the user instead. So the redirect URI earns
  // the right to receive errors only after it has been matched against a
  // resolved client. Everything before that point renders; everything after it
  // may redirect.
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  if (!clientId || !redirectUri) {
    return <p className="p-6">Missing client_id or redirect_uri.</p>;
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/oauth/authorize?${params.toString()}`)}`);
  }

  const client = await resolveClient(clientId, connectorBaseUrl());
  if (!client) {
    return <p className="p-6">Unknown client.</p>;
  }

  const uriAllowed = client.redirect_uris.some((registered) =>
    redirectUriMatches(redirectUri, registered)
  );
  if (!uriAllowed) {
    return <p className="p-6">The redirect URI is not registered for this client.</p>;
  }

  // From here the redirect URI is known to belong to this client, so protocol
  // errors go back to it as the spec expects rather than dead-ending in HTML.
  const parsed = parseAuthorizeParams(params);
  if (!parsed.ok) {
    redirect(
      buildErrorRedirect(redirectUri, parsed.error, parsed.description, params.get('state'))
    );
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
      client={describeClient(client)}
      redirectHost={new URL(parsed.request.redirectUri).host}
      loopbackOnly={loopbackOnly}
      scopes={parsed.request.scopes}
      projects={projects.map((p) => ({ uuid: p.uuid, name: p.name }))}
    />
  );
}
