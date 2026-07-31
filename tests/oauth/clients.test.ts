import { describe, expect, it } from 'vitest';
import {
  CIMD_CACHE_TTL_MS,
  DCR_CLIENT_TTL_MS,
  isCimdClientId,
  validateCimdDocument,
} from '@/lib/oauth/clients';

const URL_ID = 'https://claude.ai/oauth/claude-code-client-metadata';

describe('recognising a CIMD client id', () => {
  it('treats an https URL as CIMD', () => {
    expect(isCimdClientId(URL_ID)).toBe(true);
  });

  it('treats an opaque string as DCR', () => {
    expect(isCimdClientId('a1b2c3d4')).toBe(false);
  });

  it('refuses http — a CIMD must be fetched over TLS', () => {
    expect(isCimdClientId('http://claude.ai/oauth/metadata')).toBe(false);
  });
});

describe('validating a CIMD document', () => {
  const good = {
    client_id: URL_ID,
    client_name: 'Claude Code',
    redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'],
    application_type: 'native',
    token_endpoint_auth_method: 'none',
  };

  it('accepts a well-formed document', () => {
    const result = validateCimdDocument(URL_ID, good);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.redirect_uris).toEqual(good.redirect_uris);
      expect(result.application_type).toBe('native');
    }
  });

  it('rejects a document whose client_id does not match the URL it was fetched from', () => {
    // Otherwise any host could publish a document claiming someone else's id.
    const result = validateCimdDocument(URL_ID, { ...good, client_id: 'https://evil.example/doc' });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/client_id/i);
  });

  it('rejects a document with no redirect URIs', () => {
    const result = validateCimdDocument(URL_ID, { ...good, redirect_uris: [] });
    expect(result.valid).toBe(false);
  });

  it('rejects non-object input without throwing', () => {
    expect(validateCimdDocument(URL_ID, null).valid).toBe(false);
    expect(validateCimdDocument(URL_ID, 'a string').valid).toBe(false);
    expect(validateCimdDocument(URL_ID, []).valid).toBe(false);
  });

  it('rejects redirect_uris containing a non-string', () => {
    const result = validateCimdDocument(URL_ID, { ...good, redirect_uris: ['ok', 42] });
    expect(result.valid).toBe(false);
  });

  it('defaults application_type to web when absent', () => {
    const { application_type: _omitted, ...withoutType } = good;
    const result = validateCimdDocument(URL_ID, withoutType);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.application_type).toBe('web');
  });
});

describe('lifetimes', () => {
  it('caches CIMD documents for a day and expires DCR clients after 30 days', () => {
    // DCR registrations expire because Claude registers a new client on every
    // fresh connection when it cannot use CIMD; without a TTL the table grows
    // without bound.
    expect(CIMD_CACHE_TTL_MS).toBe(86_400_000);
    expect(DCR_CLIENT_TTL_MS).toBe(2_592_000_000);
  });
});
