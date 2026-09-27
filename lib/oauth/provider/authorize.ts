/**
 * Authorization-request parsing.
 *
 * PKCE is mandatory rather than optional: Claude sends a code_challenge with
 * S256 on every authorization request regardless of registration mechanism, and
 * OAuth 2.1 requires it. A request without one is malformed, not merely legacy.
 */

import { isConnectorResource } from './metadata';
import { isAllowedRedirectUri } from './redirect-uri';
import { parseScopeParam,type Scope } from './scopes';

export interface AuthorizeRequest {
  clientId: string;
  redirectUri: string;
  scopes: Scope[];
  state: string | null;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource: string | null;
}

type ParseResult =
  | { ok: true; request: AuthorizeRequest }
  | { ok: false; error: string; description: string };

/**
 * RFC 6749 s3.1: request parameters "MUST NOT be included more than once".
 * Reading only the first of two values would let one check validate a value
 * that something else never uses. `resource` is absent on purpose: RFC 8707 s2
 * lets it repeat, and every occurrence is checked below.
 */
const SINGLE_VALUED_PARAMS = [
  'response_type',
  'client_id',
  'redirect_uri',
  'scope',
  'state',
  'code_challenge',
  'code_challenge_method',
] as const;

/** The first single-valued parameter that appears more than once, if any. */
export function findRepeatedParam(
  params: URLSearchParams,
  names: readonly string[] = SINGLE_VALUED_PARAMS
): string | null {
  return names.find((name) => params.getAll(name).length > 1) ?? null;
}

export function parseAuthorizeParams(params: URLSearchParams): ParseResult {
  const repeated = findRepeatedParam(params);
  if (repeated) {
    return {
      ok: false,
      error: 'invalid_request',
      description: `${repeated} must not be included more than once`,
    };
  }

  if (params.get('response_type') !== 'code') {
    return {
      ok: false,
      error: 'unsupported_response_type',
      description: 'Only the authorization code flow is supported',
    };
  }

  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  if (!clientId || !redirectUri) {
    return {
      ok: false,
      error: 'invalid_request',
      description: 'client_id and redirect_uri are required',
    };
  }

  const codeChallenge = params.get('code_challenge');
  const codeChallengeMethod = params.get('code_challenge_method') ?? 'S256';
  if (!codeChallenge) {
    return { ok: false, error: 'invalid_request', description: 'code_challenge is required' };
  }
  if (codeChallengeMethod !== 'S256') {
    return {
      ok: false,
      error: 'invalid_request',
      description: 'code_challenge_method must be S256',
    };
  }

  // RFC 8707 s2. Absent means the connector, the only resource there is. The
  // parameter may repeat, so every occurrence is checked, not just the first.
  const resources = params.getAll('resource');
  const resource = resources[0] ?? null;
  if (resources.some((r) => !isConnectorResource(r))) {
    return {
      ok: false,
      error: 'invalid_target',
      description: 'resource is not a protected resource of this authorization server',
    };
  }

  return {
    ok: true,
    request: {
      clientId,
      redirectUri,
      scopes: parseScopeParam(params.get('scope')),
      state: params.get('state'),
      codeChallenge,
      codeChallengeMethod,
      resource,
    },
  };
}

export function buildErrorRedirect(
  redirectUri: string,
  error: string,
  description: string,
  state: string | null
): string {
  // The last line of defence for tickets signed before redirect URIs were
  // validated: denyConsent hands this string straight to window.location.
  if (!isAllowedRedirectUri(redirectUri)) {
    throw new Error('Refusing to redirect to a URI that is not a valid redirect target');
  }
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (state !== null) url.searchParams.set('state', state);
  return url.toString();
}
