/**
 * OAuth discovery documents.
 *
 * Pure builders so the fields that fail silently in production can be asserted
 * in a unit test. Two of them matter more than the rest:
 *
 *   client_id_metadata_document_supported: true
 *   token_endpoint_auth_methods_supported: [... 'none' ...]
 *
 * Claude selects CIMD only when BOTH are present, and falls back to DCR when
 * either is missing — with no error, no warning, and a new client registration
 * on every fresh connection.
 */

import { SUPPORTED_CHALLENGE_METHODS } from './pkce';
import { SUPPORTED_SCOPES } from './scopes';

export function connectorBaseUrl(): string {
  const raw = process.env.NEXTAUTH_URL;
  if (!raw) throw new Error('NEXTAUTH_URL is required to build OAuth metadata');
  return raw.replace(/\/+$/, '');
}

/** The protected resource — the connector's MCP endpoint — tokens are issued for. */
export function connectorResourceUrl(): string {
  return `${connectorBaseUrl()}/api/mcp`;
}

/**
 * RFC 8707: does a `resource` indicator name what this server protects?
 *
 * This authorization server issues tokens for one resource. Honouring a request
 * for any other one mints a token the client will hand to that other server —
 * which can replay it here, since a bearer token does not know who holds it.
 * Refusing foreign resources is what keeps every token's audience the connector.
 *
 * Compared as parsed URLs (case, default port and a trailing slash are spelling)
 * and on the whole origin: a tenant's agent at {name}.is.plugged.in is another
 * origin and another resource. The bare issuer origin is accepted too, for
 * clients that name the server rather than its endpoint.
 */
export function isConnectorResource(resource: string): boolean {
  let url: URL;
  try {
    url = new URL(resource);
  } catch {
    return false;
  }
  if (resource.includes('#') || url.search || url.username || url.password) return false;

  const path = (u: URL) => u.pathname.replace(/\/+$/, '');
  const connector = new URL(connectorResourceUrl());
  const issuer = new URL(connectorBaseUrl());
  return (
    url.origin === connector.origin &&
    (path(url) === path(connector) || path(url) === path(issuer))
  );
}

export function buildAuthorizationServerMetadata(issuer: string): Record<string, unknown> {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    registration_endpoint: `${issuer}/api/oauth/register`,
    revocation_endpoint: `${issuer}/api/oauth/revoke`,
    scopes_supported: [...SUPPORTED_SCOPES],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: [...SUPPORTED_CHALLENGE_METHODS],
    // Both of the following are required for CIMD selection. Do not remove
    // either without reading tests/oauth/metadata.test.ts first.
    client_id_metadata_document_supported: true,
    token_endpoint_auth_methods_supported: ['none'],
  };
}

export function buildProtectedResourceMetadata(
  resource: string,
  issuer: string
): Record<string, unknown> {
  return {
    // Must equal the MCP server URL exactly as the user types it into Claude,
    // including any path component.
    resource,
    // Only the first entry is ever used; there is no fallback to later ones.
    authorization_servers: [issuer],
    scopes_supported: [...SUPPORTED_SCOPES],
    bearer_methods_supported: ['header'],
  };
}

/**
 * Our own Client ID Metadata Document — pluggedin-app is an OAuth *client* when
 * it connects to downstream MCP servers, and 2026-07-28 deprecates DCR in
 * favour of this document.
 *
 * The redirect URI is derived from the document URL's own origin rather than
 * from NEXTAUTH_URL. A CIMD that advertised a redirect on a different origin
 * than the document it was fetched from would be self-contradictory, and
 * deriving it keeps this builder pure.
 */
export function buildClientIdMetadataDocument(clientIdUrl: string): Record<string, unknown> {
  const origin = new URL(clientIdUrl).origin;
  return {
    client_id: clientIdUrl,
    client_name: 'Plugged.in',
    application_type: 'web',
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    redirect_uris: [`${origin}/api/oauth/callback`],
  };
}
