import { describe, expect, it } from 'vitest';
import { buildUnauthorizedResponse } from '@/lib/oauth/provider/authenticate';

const METADATA_URL = 'https://plugged.in/.well-known/oauth-protected-resource';

describe('the 401 challenge', () => {
  it('uses status 401 — Claude ignores WWW-Authenticate on a 200', () => {
    expect(buildUnauthorizedResponse(METADATA_URL).status).toBe(401);
  });

  it('points at the protected resource metadata', () => {
    const header = buildUnauthorizedResponse(METADATA_URL).headers.get('WWW-Authenticate');
    expect(header).toContain('Bearer');
    expect(header).toContain(`resource_metadata="${METADATA_URL}"`);
  });

  it('includes requested scopes so Claude asks for the right ones', () => {
    const header = buildUnauthorizedResponse(METADATA_URL, [
      'library:read',
      'offline_access',
    ]).headers.get('WWW-Authenticate');
    expect(header).toContain('scope="library:read offline_access"');
  });

  it('omits the scope parameter when none are given', () => {
    const header = buildUnauthorizedResponse(METADATA_URL).headers.get('WWW-Authenticate');
    expect(header).not.toContain('scope=');
  });

  it('is not cached', () => {
    expect(buildUnauthorizedResponse(METADATA_URL).headers.get('Cache-Control')).toBe('no-store');
  });
});
