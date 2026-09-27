import { describe, expect, it } from 'vitest';

import { validateServiceUrl } from '@/lib/validation-utils';

/**
 * validateServiceUrl kept its own hostname regexes (deepsec
 * pluggedin-app-ssrf-68313ff04e). They covered 127.0.0.1 but not the rest of
 * 127/8, and applied unbracketed IPv6 patterns to URL hostnames, which are
 * always bracketed — so `[fd00::1]` or an IPv4-mapped loopback sailed through.
 *
 * The shared classifier from lib/security/validators decides on the parsed
 * address instead, the same one safeFetch and validateMcpUrl use.
 */

describe('validateServiceUrl refuses every non-public literal', () => {
  it.each([
    ['http://127.0.0.2:8080', 'loopback beyond .1'],
    ['http://127.1.2.3', 'loopback'],
    ['http://[fd00::1]', 'IPv6 unique local'],
    ['http://[fe80::1]', 'IPv6 link-local'],
    ['http://[::ffff:127.0.0.1]', 'IPv4-mapped loopback'],
    ['http://[::ffff:a9fe:a9fe]', 'IPv4-mapped metadata'],
    ['http://[0:0:0:0:0:0:0:1]', 'loopback, long form'],
    ['http://224.0.0.1', 'multicast'],
    ['http://198.18.0.1', 'benchmarking'],
    ['http://localhost.', 'root-qualified localhost'],
    ['http://api.localhost', 'a localhost subdomain'],
    ['http://metadata.google.internal.', 'root-qualified metadata host'],
  ])('rejects %s (%s)', (url) => {
    expect(() => validateServiceUrl(url, '/health')).toThrow(/Blocked URL/);
  });

  it('still accepts a public service', () => {
    expect(validateServiceUrl('https://models.example.com', '/health')).toBe(
      'https://models.example.com/health'
    );
  });

  it('still refuses non-http schemes', () => {
    expect(() => validateServiceUrl('file:///etc/passwd', '/health')).toThrow(/protocol/);
  });
});
