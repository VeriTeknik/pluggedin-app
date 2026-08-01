import { describe, expect, it } from 'vitest';
import {
  oauthClientsTable,
  oauthAuthorizationCodesTable,
  oauthAccessTokensTable,
  oauthRefreshTokensTable,
} from '@/db/schema';

describe('oauth schema', () => {
  it('stores credentials as hashes, never plaintext', () => {
    // The column is named token_hash on purpose: a column called `token`
    // invites someone to write the token into it.
    expect(oauthAccessTokensTable.token_hash).toBeDefined();
    expect((oauthAccessTokensTable as unknown as Record<string, unknown>).token).toBeUndefined();
    expect(oauthRefreshTokensTable.token_hash).toBeDefined();
    expect((oauthRefreshTokensTable as unknown as Record<string, unknown>).token).toBeUndefined();
  });

  it('carries the fields refresh-token reuse detection needs', () => {
    expect(oauthRefreshTokensTable.family_id).toBeDefined();
    expect(oauthRefreshTokensTable.parent_id).toBeDefined();
    expect(oauthRefreshTokensTable.rotated_at).toBeDefined();
    expect(oauthRefreshTokensTable.revoked_at).toBeDefined();
    expect(oauthRefreshTokensTable.revocation_reason).toBeDefined();
  });

  it('binds authorization codes to PKCE and a redirect URI', () => {
    expect(oauthAuthorizationCodesTable.code_challenge).toBeDefined();
    expect(oauthAuthorizationCodesTable.code_challenge_method).toBeDefined();
    expect(oauthAuthorizationCodesTable.redirect_uri).toBeDefined();
    expect(oauthAuthorizationCodesTable.consumed_at).toBeDefined();
  });

  it('scopes access to a Hub set, not a bare user', () => {
    expect(oauthAccessTokensTable.granted_project_uuids).toBeDefined();
    expect(oauthAuthorizationCodesTable.granted_project_uuids).toBeDefined();
  });

  it('keys clients by issuer so credentials cannot be reused across servers', () => {
    expect(oauthClientsTable.issuer).toBeDefined();
    expect(oauthClientsTable.client_id).toBeDefined();
    expect(oauthClientsTable.registration_type).toBeDefined();
  });
});
