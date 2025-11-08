/**
 * RFC 7591: OAuth 2.0 Dynamic Client Registration Protocol
 * https://www.rfc-editor.org/rfc/rfc7591.html
 *
 * Registers OAuth clients dynamically with authorization servers
 */

export interface ClientRegistrationRequest {
  redirect_uris: string[];
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  contacts?: string[];
  grant_types?: string[];
  response_types?: string[];
  scope?: string;
  token_endpoint_auth_method?: string;
}

export interface ClientRegistrationResponse {
  client_id: string;
  client_secret?: string;
  client_secret_expires_at?: number;
  registration_access_token?: string;
  registration_client_uri?: string;
  client_id_issued_at?: number;
  // Echo back the request
  redirect_uris: string[];
  client_name?: string;
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
}

/**
 * Register a new OAuth client with the authorization server
 */
export async function registerOAuthClient(
  registrationEndpoint: string,
  redirectUri: string
): Promise<ClientRegistrationResponse> {
  const registrationRequest: ClientRegistrationRequest = {
    redirect_uris: [redirectUri],
    client_name: 'Plugged.in',
    client_uri: process.env.NEXTAUTH_URL || 'http://localhost:12005',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none', // For PKCE, we don't need client_secret
    scope: '', // Will be populated based on server capabilities
  };

  console.log('[Dynamic Registration] Registering client at:', registrationEndpoint);
  console.log('[Dynamic Registration] Request:', registrationRequest);

  const response = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(registrationRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Dynamic Registration] Failed:', response.status, errorText);
    throw new Error(`Client registration failed: ${response.status} - ${errorText}`);
  }

  const registrationResponse = await response.json() as ClientRegistrationResponse;

  console.log('[Dynamic Registration] Success! Client ID:', registrationResponse.client_id);

  return registrationResponse;
}

/**
 * Get or register OAuth client for a server
 * Returns existing client_id if already registered, otherwise registers new client
 */
export async function getOrRegisterClient(
  serverUuid: string,
  registrationEndpoint: string,
  redirectUri: string,
  existingClientId?: string | null
): Promise<{ client_id: string; client_secret?: string }> {
  // If we already have a client_id, return it
  if (existingClientId) {
    console.log('[Dynamic Registration] Using existing client_id:', existingClientId);
    return { client_id: existingClientId };
  }

  // Otherwise, register a new client
  const registration = await registerOAuthClient(registrationEndpoint, redirectUri);

  return {
    client_id: registration.client_id,
    client_secret: registration.client_secret,
  };
}
