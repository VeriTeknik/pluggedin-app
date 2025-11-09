/**
 * RFC 9728: OAuth 2.0 Authorization Server Metadata Discovery
 * https://www.rfc-editor.org/rfc/rfc9728.html
 *
 * This module implements OAuth discovery for MCP servers that follow RFC 9728.
 */

import { log } from '@/lib/observability/logger';
import { recordDiscovery } from '@/lib/observability/oauth-metrics';

export interface OAuthMetadata {
  issuer?: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
  code_challenge_methods_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
}

export interface ParsedWWWAuthenticate {
  scheme: string;
  realm?: string;
  authorization_server?: string;
  resource_identifier?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

/**
 * Parse WWW-Authenticate header
 * Example: Bearer realm="https://auth.example.com", authorization_server="https://auth.example.com"
 */
export function parseWWWAuthenticate(header: string): ParsedWWWAuthenticate | null {
  if (!header) return null;

  // Split scheme and parameters
  const parts = header.trim().split(/\s+/);
  if (parts.length < 1) return null;

  const scheme = parts[0];
  const result: ParsedWWWAuthenticate = { scheme };

  // Parse parameters (key="value" pairs)
  const paramString = parts.slice(1).join(' ');
  const paramRegex = /(\w+)="([^"]+)"/g;
  let match;

  while ((match = paramRegex.exec(paramString)) !== null) {
    const [, key, value] = match;
    switch (key) {
      case 'realm':
        result.realm = value;
        break;
      case 'authorization_server':
        result.authorization_server = value;
        break;
      case 'resource_identifier':
        result.resource_identifier = value;
        break;
      case 'scope':
        result.scope = value;
        break;
      case 'error':
        result.error = value;
        break;
      case 'error_description':
        result.error_description = value;
        break;
    }
  }

  return result;
}

/**
 * Discover OAuth metadata from authorization server
 * Implements RFC 8414 (OAuth 2.0 Authorization Server Metadata)
 *
 * @param authorizationServer - Base URL of the authorization server
 * @returns OAuth metadata or null if discovery fails
 */
export async function discoverOAuthMetadata(
  authorizationServer: string
): Promise<OAuthMetadata | null> {
  const startTime = Date.now();

  try {
    // Normalize authorization server URL (remove trailing slash)
    const serverUrl = authorizationServer.replace(/\/$/, '');

    // RFC 8414: Metadata is at /.well-known/oauth-authorization-server
    const metadataUrl = `${serverUrl}/.well-known/oauth-authorization-server`;

    log.oauth('oauth_discovery_initiated', {
      authorizationServer,
      metadataUrl
    });

    const response = await fetch(metadataUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      log.warn('RFC9728: Metadata endpoint error', {
        metadataUrl,
        statusCode: response.status
      });
      const durationSeconds = (Date.now() - startTime) / 1000;
      recordDiscovery('rfc9728', false, durationSeconds);
      return null;
    }

    const metadata = await response.json() as OAuthMetadata;

    // Validate required fields
    if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
      log.warn('RFC9728: Metadata missing required endpoints', {
        metadataUrl,
        hasAuthEndpoint: !!metadata.authorization_endpoint,
        hasTokenEndpoint: !!metadata.token_endpoint
      });
      const durationSeconds = (Date.now() - startTime) / 1000;
      recordDiscovery('rfc9728', false, durationSeconds);
      return null;
    }

    log.oauth('oauth_discovery_success', {
      authorizationServer,
      authorizationEndpoint: metadata.authorization_endpoint,
      tokenEndpoint: metadata.token_endpoint,
      registrationEndpoint: metadata.registration_endpoint,
      scopesSupported: metadata.scopes_supported
    });

    const durationSeconds = (Date.now() - startTime) / 1000;
    recordDiscovery('rfc9728', true, durationSeconds);
    return metadata;
  } catch (error) {
    log.error('RFC9728: OAuth discovery error', error, {
      authorizationServer
    });
    const durationSeconds = (Date.now() - startTime) / 1000;
    recordDiscovery('rfc9728', false, durationSeconds);
    return null;
  }
}

/**
 * Perform full OAuth discovery from a 401 response
 *
 * @param response - Response object with 401 status
 * @param serverUrl - Base URL of the MCP server
 * @returns OAuth metadata or null
 */
export async function discoverOAuthFromResponse(
  response: Response,
  serverUrl: string
): Promise<{
  metadata: OAuthMetadata | null;
  authServer: string | null;
  resourceId: string | null;
  discoveryMethod: 'rfc9728' | 'www-authenticate' | 'manual' | null;
}> {
  // Step 1: Check WWW-Authenticate header
  const authHeader = response.headers.get('WWW-Authenticate');

  if (authHeader) {
    const parsed = parseWWWAuthenticate(authHeader);

    if (parsed?.authorization_server) {
      log.oauth('oauth_www_authenticate_found', {
        serverUrl,
        authorizationServer: parsed.authorization_server,
        resourceIdentifier: parsed.resource_identifier
      });

      // Try RFC 9728 discovery
      const metadata = await discoverOAuthMetadata(parsed.authorization_server);

      if (metadata) {
        return {
          metadata,
          authServer: parsed.authorization_server,
          resourceId: parsed.resource_identifier || null,
          discoveryMethod: 'rfc9728',
        };
      }
    }
  }

  // Step 2: Try discovering from server URL itself
  try {
    const serverOrigin = new URL(serverUrl).origin;
    const metadata = await discoverOAuthMetadata(serverOrigin);

    if (metadata) {
      log.oauth('oauth_discovery_from_origin_success', {
        serverUrl,
        serverOrigin
      });
      return {
        metadata,
        authServer: serverOrigin,
        resourceId: serverUrl,
        discoveryMethod: 'rfc9728',
      };
    }
  } catch (error) {
    log.error('RFC9728: Server origin discovery error', error, { serverUrl });
  }

  // Step 3: No discovery possible
  return {
    metadata: null,
    authServer: null,
    resourceId: null,
    discoveryMethod: null,
  };
}
