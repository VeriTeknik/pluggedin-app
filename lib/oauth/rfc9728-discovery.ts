/**
 * RFC 9728: OAuth 2.0 Authorization Server Metadata Discovery
 * https://www.rfc-editor.org/rfc/rfc9728.html
 *
 * This module implements OAuth discovery for MCP servers that follow RFC 9728.
 */

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
  try {
    // Normalize authorization server URL (remove trailing slash)
    const serverUrl = authorizationServer.replace(/\/$/, '');

    // RFC 8414: Metadata is at /.well-known/oauth-authorization-server
    const metadataUrl = `${serverUrl}/.well-known/oauth-authorization-server`;

    console.log(`[RFC9728] Discovering OAuth metadata from: ${metadataUrl}`);

    const response = await fetch(metadataUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      console.warn(`[RFC9728] Metadata endpoint returned ${response.status}`);
      return null;
    }

    const metadata = await response.json() as OAuthMetadata;

    // Validate required fields
    if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
      console.warn('[RFC9728] Metadata missing required endpoints');
      return null;
    }

    console.log('[RFC9728] OAuth metadata discovered successfully:', {
      authorization_endpoint: metadata.authorization_endpoint,
      token_endpoint: metadata.token_endpoint,
      registration_endpoint: metadata.registration_endpoint,
      scopes_supported: metadata.scopes_supported,
    });

    return metadata;
  } catch (error) {
    console.error('[RFC9728] Error discovering OAuth metadata:', error);
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
      console.log('[RFC9728] Found authorization_server in WWW-Authenticate:', parsed.authorization_server);

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
      console.log('[RFC9728] Discovered OAuth metadata from server origin');
      return {
        metadata,
        authServer: serverOrigin,
        resourceId: serverUrl,
        discoveryMethod: 'rfc9728',
      };
    }
  } catch (error) {
    console.error('[RFC9728] Error trying server origin discovery:', error);
  }

  // Step 3: No discovery possible
  return {
    metadata: null,
    authServer: null,
    resourceId: null,
    discoveryMethod: null,
  };
}
