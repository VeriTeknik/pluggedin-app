/**
 * A third copy of the SSRF host checks lived in app/api/clusters/route.ts, with
 * its own BLOCKED_HOSTS list and its own isPrivateNetwork(). It has the same
 * defect GHSA-gmhc-h765-37cg described in the other two: it matched the text of
 * `new URL(url).hostname`, which for IPv6 is bracketed and for IPv4-mapped
 * addresses is hex-canonicalised.
 *
 * `[::1]` happened to be caught, because it was in the list as a literal
 * string. Nothing else was: `[fe80::1]` never matched `/^fe80:/`, and
 * `[::ffff:7f00:1]` — what Node produces for `[::ffff:127.0.0.1]` — matched
 * nothing at all.
 *
 * Surfaced by the reporter's own patch to the advisory, which touched this file;
 * the shipped fix followed validateUrlForSSRF and validateMcpUrl and stopped
 * there.
 */
import { describe, expect, it } from 'vitest';

import { isCollectorUrlAllowed } from '@/app/api/clusters/collector-url';

describe('cluster collector_url host checks', () => {
  it.each([
    ['https://[::1]/', 'IPv6 loopback'],
    ['https://[::ffff:127.0.0.1]/', 'IPv4-mapped loopback, dotted'],
    ['https://[::ffff:7f00:1]/', 'IPv4-mapped loopback, hex'],
    ['https://[::ffff:169.254.169.254]/', 'IPv4-mapped cloud metadata'],
    ['https://[::ffff:a9fe:a9fe]/', 'IPv4-mapped cloud metadata, hex'],
    ['https://[fe80::1]/', 'IPv6 link-local'],
    ['https://[fd00::1]/', 'IPv6 unique local'],
    ['https://localhost./', 'root-qualified localhost'],
    ['https://127.0.0.1/', 'IPv4 loopback'],
    ['https://169.254.169.254/', 'cloud metadata'],
    ['https://10.0.0.5/', 'RFC 1918'],
    ['https://metadata.google.internal/', 'GCP metadata by name'],
    ['https://kubernetes.default.svc/', 'in-cluster API by name'],
  ])('rejects %s (%s)', (url) => {
    expect(isCollectorUrlAllowed(url)).toBe(false);
  });

  it.each([
    'https://collector.example.com/',
    'https://collector.example.com:8443/path',
    'https://[2606:4700:4700::1111]/',
  ])('allows the public collector %s', (url) => {
    expect(isCollectorUrlAllowed(url)).toBe(true);
  });

  it('rejects a malformed url rather than letting it through', () => {
    expect(isCollectorUrlAllowed('not a url')).toBe(false);
  });
});
