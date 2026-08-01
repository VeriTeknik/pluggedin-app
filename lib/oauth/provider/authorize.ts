/**
 * Authorization-request parsing.
 *
 * PKCE is mandatory rather than optional: Claude sends a code_challenge with
 * S256 on every authorization request regardless of registration mechanism, and
 * OAuth 2.1 requires it. A request without one is malformed, not merely legacy.
 */

import { type Scope, parseScopeParam } from './scopes';

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

export function parseAuthorizeParams(params: URLSearchParams): ParseResult {
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

  return {
    ok: true,
    request: {
      clientId,
      redirectUri,
      scopes: parseScopeParam(params.get('scope')),
      state: params.get('state'),
      codeChallenge,
      codeChallengeMethod,
      resource: params.get('resource'),
    },
  };
}

export function buildErrorRedirect(
  redirectUri: string,
  error: string,
  description: string,
  state: string | null
): string {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (state !== null) url.searchParams.set('state', state);
  return url.toString();
}
