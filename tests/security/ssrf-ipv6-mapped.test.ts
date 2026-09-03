/**
 * GHSA-gmhc-h765-37cg — reported by tonghuaroot.
 *
 * The SSRF guards blocked private hosts by matching the text of
 * `new URL(url).hostname`. Two properties of that value defeat the match:
 *
 *   1. IPv6 hosts come back bracketed, so `hostname === '::1'` is false for
 *      `http://[::1]/` — the string is `[::1]`. Every anchored pattern in the
 *      list (`/^fe80:/`, `/^::ffff:127\./`) fails for the same reason.
 *   2. WHATWG canonicalises an IPv4-mapped address to hex, never dotted
 *      decimal: `http://[::ffff:127.0.0.1]/` has hostname `[::ffff:7f00:1]`.
 *      The `/^::ffff:127\./` pattern was written for a spelling Node does not
 *      produce.
 *
 * Node then resolves the mapped host to the embedded IPv4 at the socket layer,
 * so the request reaches 127.0.0.1 or 169.254.169.254 regardless. Verified:
 * fetching `http://[::ffff:7f00:1]:PORT/` reaches a server bound to
 * 127.0.0.1.
 *
 * These cases are the canonical forms an attacker actually gets to send, taken
 * from `new URL(...).hostname` rather than written by hand.
 */
import { describe, expect, it } from 'vitest';

import { validateUrlForSSRF } from '@/lib/oauth/ssrf-protection';
import { isPrivateAddress, validateMcpUrl } from '@/lib/security/validators';

/** hostname as WHATWG produces it, alongside the address it really reaches. */
const BLOCKED = [
  ['http://[::1]/', 'IPv6 loopback'],
  ['http://[::ffff:127.0.0.1]/', 'IPv4-mapped loopback, dotted spelling'],
  ['http://[::ffff:7f00:1]/', 'IPv4-mapped loopback, hex spelling'],
  ['http://[0:0:0:0:0:ffff:7f00:1]/', 'IPv4-mapped loopback, uncompressed'],
  ['http://[::ffff:169.254.169.254]/', 'IPv4-mapped cloud metadata'],
  ['http://[::ffff:a9fe:a9fe]/', 'IPv4-mapped cloud metadata, hex spelling'],
  ['http://[::ffff:10.0.0.1]/', 'IPv4-mapped RFC 1918'],
  ['http://[fe80::1]/', 'IPv6 link-local'],
  ['http://[fd00::1]/', 'IPv6 unique local'],
  ['http://[::]/', 'IPv6 unspecified'],
] as const;

describe('SSRF guards, IPv6 and IPv4-mapped hosts', () => {
  describe('validateUrlForSSRF', () => {
    for (const [url, what] of BLOCKED) {
      it(`rejects ${what} — ${url}`, () => {
        expect(() => validateUrlForSSRF(url)).toThrow(/private or reserved/i);
      });
    }

    it('still allows a public host', () => {
      expect(() => validateUrlForSSRF('https://example.com/')).not.toThrow();
    });

    it('still allows a public IPv6 host', () => {
      expect(() => validateUrlForSSRF('http://[2606:4700:4700::1111]/')).not.toThrow();
    });
  });

  describe('validateMcpUrl', () => {
    for (const [url, what] of BLOCKED) {
      it(`rejects ${what} — ${url}`, () => {
        expect(validateMcpUrl(url).valid).toBe(false);
      });
    }

    it('still allows a public host', () => {
      expect(validateMcpUrl('https://example.com/').valid).toBe(true);
    });

    // A trailing dot root-qualifies a name: `localhost.` reaches localhost but
    // does not equal it. Raised by CodeRabbit on PR #228.
    it.each(['http://localhost./', 'http://LOCALHOST./', 'http://127.0.0.1./'])(
      'rejects the root-qualified form %s',
      (url) => {
        expect(validateMcpUrl(url).valid).toBe(false);
      }
    );
  });

  describe('isPrivateAddress', () => {
    // The socket-level check behind pinnedHeadRequest. dns.lookup can return a
    // mapped address directly, so the hex spelling has to be understood here
    // too, not only at the URL layer.
    it.each([
      '::ffff:7f00:1',
      '::ffff:a9fe:a9fe',
      '::ffff:127.0.0.1',
      '0:0:0:0:0:ffff:7f00:1',
      '[::1]',
      '[::ffff:7f00:1]',
    ])('treats %s as private', (address) => {
      expect(isPrivateAddress(address)).toBe(true);
    });

    it('still treats a public address as public', () => {
      expect(isPrivateAddress('93.184.216.34')).toBe(false);
      expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
    });
  });
});
