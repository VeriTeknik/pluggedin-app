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
