import { describe, expect, it } from 'vitest';
import {
  buildAuthorizationServerMetadata,
  buildClientIdMetadataDocument,
  buildProtectedResourceMetadata,
} from '@/lib/oauth/metadata';

const ISSUER = 'https://plugged.in';
const RESOURCE = 'https://plugged.in/api/mcp';

describe('authorization server metadata', () => {
  const meta = buildAuthorizationServerMetadata(ISSUER);

  it('advertises BOTH fields Claude requires to choose CIMD over DCR', () => {
    // Claude selects CIMD only when both are present. Missing either one
    // silently falls back to DCR, which registers a new client on every fresh
    // connection. This assertion is the only thing standing between us and
    // that regression.
    expect(meta.client_id_metadata_document_supported).toBe(true);
    expect(meta.token_endpoint_auth_methods_supported).toContain('none');
  });

  it('advertises S256 PKCE', () => {
    expect(meta.code_challenge_methods_supported).toEqual(['S256']);
  });

  it('advertises offline_access so Claude requests a refresh token', () => {
    expect(meta.scopes_supported).toContain('offline_access');
  });

  it('points at the right endpoints', () => {
    expect(meta.issuer).toBe(ISSUER);
    expect(meta.authorization_endpoint).toBe('https://plugged.in/oauth/authorize');
    expect(meta.token_endpoint).toBe('https://plugged.in/api/oauth/token');
    expect(meta.registration_endpoint).toBe('https://plugged.in/api/oauth/register');
    expect(meta.revocation_endpoint).toBe('https://plugged.in/api/oauth/revoke');
  });

  it('supports the authorization_code and refresh_token grants only', () => {
    expect(meta.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
    expect(meta.response_types_supported).toEqual(['code']);
  });
});

describe('protected resource metadata', () => {
  const meta = buildProtectedResourceMetadata(RESOURCE, ISSUER);

  it('states the resource exactly as the user types it into Claude', () => {
    expect(meta.resource).toBe(RESOURCE);
  });

  it('lists exactly one authorization server, because only the first is used', () => {
    expect(meta.authorization_servers).toEqual([ISSUER]);
  });

  it('advertises the scopes Claude should request', () => {
    expect(meta.scopes_supported).toContain('library:read');
    expect(meta.scopes_supported).toContain('offline_access');
  });
});

describe('our own client id metadata document', () => {
  const doc = buildClientIdMetadataDocument('https://plugged.in/.well-known/mcp-client');

  it('uses the document URL as the client_id', () => {
    expect(doc.client_id).toBe('https://plugged.in/.well-known/mcp-client');
  });

  it('declares application_type to avoid OIDC redirect-URI conflicts', () => {
    expect(doc.application_type).toBe('web');
  });

  it('authenticates as a public client', () => {
    expect(doc.token_endpoint_auth_method).toBe('none');
  });
});
